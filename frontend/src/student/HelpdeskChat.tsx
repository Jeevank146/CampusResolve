import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Paperclip,
  LoaderCircle,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const KNOWLEDGE_UPLOAD_URL = import.meta.env.VITE_N8N_KNOWLEDGE_UPLOAD_URL ?? '';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'docx'];

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  queryText?: string;
  rating?: number;
  helpful?: boolean | null;
  comments?: string;
  feedbackSubmitted?: boolean;
  feedbackLoading?: boolean;
  feedbackError?: string;
  showFeedback?: boolean;
};

type Props = {
  accessToken?: string | null;
};

function extractAnswer(data: any): string {
  if (typeof data === 'string') return data.trim();
  if (Array.isArray(data)) {
    for (const item of data) {
      const answer = extractAnswer(item);
      if (answer) return answer;
    }
    return '';
  }
  if (!data || typeof data !== 'object') return '';

  for (const key of ['answer', 'response', 'output', 'text']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim() && !/workflow was started/i.test(value)) {
      return value.trim();
    }
  }

  for (const key of ['n8n_response', 'data', 'result', 'body']) {
    const answer = extractAnswer(data[key]);
    if (answer) return answer;
  }
  return '';
}

function renderInline(text: string): ReactNode[] {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|https?:\/\/[^\s<]+)/g;
  return text.split(tokenPattern).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (/^https?:\/\//.test(part)) {
      const cleanUrl = part.replace(/[),.;]+$/, '');
      const trailing = part.slice(cleanUrl.length);
      return <span key={index}><a href={cleanUrl} target="_blank" rel="noreferrer">{cleanUrl}</a>{trailing}</span>;
    }
    return part;
  });
}

function renderFormattedAnswer(text: string): ReactNode {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  const getCells = (line: string) =>
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  const isTableDivider = (line: string) =>
    line.includes('|') && getCells(line).every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
  const isBullet = (line: string) => /^\s*[-*+]\s+/.test(line);
  const isNumbered = (line: string) => /^\s*\d+[.)]\s+/.test(line);
  const isHeading = (line: string) => /^#{1,4}\s+/.test(line);

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    // Markdown tables: header, divider, then one or more data rows.
    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1].trim())) {
      const headers = getCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(getCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="answer-table-wrap" key={`table-${index}`}>
          <table className="answer-table">
            <thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{renderInline(row[cellIndex] || '')}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Headings
    if (isHeading(line)) {
      const level = Math.min((line.match(/^#+/) || ['##'])[0].length, 4);
      const heading = line.replace(/^#{1,4}\s+/, '');
      blocks.push(level <= 2
        ? <h2 key={`heading-${index}`}>{renderInline(heading)}</h2>
        : <h3 key={`heading-${index}`}>{renderInline(heading)}</h3>);
      index += 1;
      continue;
    }

    // Bullet lists
    if (isBullet(line)) {
      const items: string[] = [];
      while (index < lines.length && isBullet(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''));
        index += 1;
      }
      blocks.push(<ul key={`bullets-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>);
      continue;
    }

    // Numbered lists
    if (isNumbered(line)) {
      const items: string[] = [];
      while (index < lines.length && isNumbered(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push(<ol key={`numbered-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ol>);
      continue;
    }

    // Blockquotes
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((part, quoteIndex) => <p key={quoteIndex}>{renderInline(part)}</p>)}</blockquote>);
      continue;
    }

    // Paragraphs
    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || isHeading(next) || isBullet(next) || isNumbered(next) || next.startsWith('>') ||
          (next.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1].trim()))) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join(' '))}</p>);
  }

  return <div className="answer-content">{blocks}</div>;
}

export default function HelpdeskChat({ accessToken }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hello! I'm CampusResolve AI Assistant. Ask me anything about Vignan University academics, examinations, hostel, transport and campus facilities.",
    },
  ]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, uploading]);

  function addAssistantMessage(text: string) {
    setMessages(previous => [
      ...previous,
      { id: `assistant-${Date.now()}`, role: 'assistant', text },
    ]);
  }

  function updateMessage(id: string, changes: Partial<Message>) {
    setMessages(previous => previous.map(message =>
      message.id === id ? { ...message, ...changes } : message,
    ));
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setUploadError('');
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setUploadError('Only PDF, TXT and DOCX files are supported.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File size must be 100 MB or less.');
      return;
    }
    if (!KNOWLEDGE_UPLOAD_URL) {
      setUploadError('Knowledge upload URL is not configured. Set VITE_N8N_KNOWLEDGE_UPLOAD_URL.');
      return;
    }

    setUploading(true);
    setUploadName(file.name);
    setMessages(previous => [
      ...previous,
      { id: `upload-${Date.now()}`, role: 'user', text: `Upload document: ${file.name}` },
    ]);

    try {
      const formData = new FormData();
      // The n8n Webhook receives the uploaded file as binary property "data".
      formData.append('data', file, file.name);

      const response = await fetch(KNOWLEDGE_UPLOAD_URL, {
        method: 'POST',
        body: formData,
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText || `Upload failed (${response.status}).`);
      }

      addAssistantMessage(
        `“${file.name}” was uploaded to the university knowledge base successfully. You can now ask questions about this document.`,
      );
    } catch (error) {
      addAssistantMessage(
        error instanceof Error
          ? `I couldn't upload the document: ${error.message}`
          : 'I could not upload the document. Please try again.',
      );
    } finally {
      setUploading(false);
      setUploadName('');
    }
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = question.trim();
    if (!message || loading) return;

    setMessages(previous => [
      ...previous,
      { id: `user-${Date.now()}`, role: 'user', text: message },
    ]);
    setQuestion('');
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch(`${API}/api/automation/supervisor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: 'knowledge.query',
          source: 'student_helpdesk',
          message,
          context: {},
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to get an AI answer.');
      }

      const answer = extractAnswer(data);
      if (!answer) throw new Error('AI answer was not returned. Please check the Supervisor workflow.');

      setMessages(previous => [
        ...previous,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: answer,
          queryText: message,
          showFeedback: true,
          helpful: null,
        },
      ]);
    } catch (error) {
      addAssistantMessage(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(message: Message) {
    if (!accessToken) {
      updateMessage(message.id, { feedbackError: 'Please login again to submit feedback.' });
      return;
    }
    if (!message.rating) {
      updateMessage(message.id, { feedbackError: 'Please select a star rating.' });
      return;
    }

    updateMessage(message.id, { feedbackLoading: true, feedbackError: '' });
    try {
      const response = await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          feedback_type: 'AI_RESPONSE',
          rating: message.rating,
          helpful: message.helpful ?? null,
          comments: message.comments?.trim() || null,
          query_text: message.queryText,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to submit feedback.');
      updateMessage(message.id, { feedbackSubmitted: true, feedbackLoading: false, feedbackError: '' });
    } catch (error) {
      updateMessage(message.id, {
        feedbackLoading: false,
        feedbackError: error instanceof Error ? error.message : 'Feedback submission failed.',
      });
    }
  }

  return (
    <div className="helpdesk-container">
      <style>{`
        .helpdesk-container{width:calc(100% - 48px);max-width:1100px;height:min(82vh,850px);min-height:620px;margin:24px auto;display:flex;flex-direction:column;background:#fff;border:1px solid #e5eaf2;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(20,35,65,.09)}
        .helpdesk-header{flex-shrink:0;padding:23px 26px;background:#202d53;color:#fff;display:flex;align-items:center;gap:14px}
        .helpdesk-header h2{margin:0;font-size:21px;font-weight:750}.helpdesk-header p{margin:5px 0 0;color:#d5def9;font-size:13px}
        .helpdesk-messages{flex:1;min-height:0;max-height:none;overflow-y:auto;padding:26px;display:flex;flex-direction:column;gap:20px;background:#f8faff}
        .helpdesk-message{display:flex;align-items:flex-start;gap:12px;max-width:96%;min-width:0}.helpdesk-message.user{align-self:flex-end;flex-direction:row-reverse}
        .helpdesk-avatar{flex-shrink:0;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#e8ecff;color:#596de3}
        .helpdesk-bubble{min-width:0;max-width:100%;padding:17px 20px;border-radius:13px;background:#fff;border:1px solid #e5eaf2;color:#34405b;font-size:16px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}
        .helpdesk-message.user .helpdesk-bubble{background:#596de3;color:#fff;border:0}
        .feedback-card{margin-top:12px;padding:13px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
        .feedback-title{color:#334155;font-size:12px;font-weight:700;margin-bottom:9px;display:flex;gap:7px;align-items:center}
        .feedback-stars{display:flex;gap:6px;margin-bottom:12px}.feedback-star{border:0;background:transparent;padding:2px;cursor:pointer;color:#cbd5e1}.feedback-star.selected{color:#f59e0b}
        .feedback-actions{display:flex;gap:8px;margin-bottom:12px}.feedback-choice{display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #dbe2ed;border-radius:7px;background:#f8fafc;color:#475569;font-size:11px;cursor:pointer}
        .feedback-choice.selected{background:#eef2ff;border-color:#596de3;color:#3730a3}.feedback-comment{width:100%;box-sizing:border-box;min-height:58px;resize:vertical;padding:9px;border:1px solid #dbe2ed;border-radius:7px;font:inherit;font-size:12px;margin-bottom:10px}
        .feedback-submit{border:0;border-radius:7px;padding:9px 15px;background:#596de3;color:#fff;font-size:12px;font-weight:650;cursor:pointer}.feedback-submit:disabled{opacity:.5;cursor:not-allowed}
        .feedback-success{font-size:12px;color:#15803d;font-weight:650}.feedback-error{color:#b91c1c;font-size:11px;margin:5px 0}
        .helpdesk-form{padding:15px;display:flex;align-items:center;gap:10px;border-top:1px solid #edf0f5;background:#fff}
        .helpdesk-form textarea{flex:1;min-width:0;resize:none;min-height:54px;max-height:120px;padding:14px 16px;border:1px solid #dfe5ef;border-radius:10px;font:inherit;font-size:15px;outline:none}
        .helpdesk-form textarea:focus{border-color:#697be6}.helpdesk-send{width:52px;min-width:52px;height:52px;border:0;border-radius:9px;background:#596de3;color:#fff;cursor:pointer}
        .helpdesk-send:disabled,.helpdesk-upload:disabled{opacity:.5;cursor:not-allowed}.helpdesk-upload{width:52px;min-width:52px;height:52px;border:1px solid #dfe5ef;border-radius:9px;background:#f8faff;color:#596de3;display:grid;place-items:center;cursor:pointer}
        .helpdesk-upload:hover:not(:disabled){background:#eef2ff;border-color:#aab5f5}.helpdesk-upload-status{padding:0 16px 12px;color:#64748b;font-size:11px;background:#fff}.helpdesk-upload-error{color:#b91c1c}
        .helpdesk-typing{color:#778399;font-size:14px}.answer-content{white-space:normal;line-height:1.85;color:#34405b;font-size:16px;overflow-wrap:anywhere}.answer-content p{margin:0 0 13px}.answer-content h2{margin:22px 0 12px;font-size:23px;line-height:1.35;font-weight:750;color:#202d53}.answer-content h3{margin:19px 0 10px;font-size:19px;line-height:1.4;font-weight:700;color:#263b68}.answer-content ul,.answer-content ol{padding-left:24px;margin:9px 0 16px}.answer-content li{margin-bottom:8px;padding-left:3px}.answer-content strong{color:#1e3157;font-weight:700}.answer-content a{color:#4f63d9;text-decoration:underline;overflow-wrap:anywhere}.answer-content code{padding:2px 5px;border-radius:4px;background:#eef2ff;color:#263b68;font-size:.92em}.answer-content blockquote{margin:12px 0;padding:10px 14px;border-left:3px solid #697be6;background:#f1f4ff;border-radius:0 8px 8px 0}.answer-content blockquote p:last-child{margin-bottom:0}.answer-table-wrap{width:100%;overflow-x:auto;margin:14px 0 18px;border:1px solid #e1e7f0;border-radius:9px}.answer-table{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;background:#fff;font-size:15px;line-height:1.65}.answer-table th,.answer-table td{padding:13px 14px;border-bottom:1px solid #e7ebf3;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:normal}.answer-table th{background:#eef2ff;color:#202d53;font-weight:700}.answer-table tr:last-child td{border-bottom:0}.answer-table tbody tr:nth-child(even){background:#fafbff}
        @media(max-width:700px){.helpdesk-container{width:calc(100% - 20px);height:82vh;min-height:520px;margin:10px auto}.helpdesk-header{padding:17px}.helpdesk-header h2{font-size:18px}.helpdesk-messages{padding:15px;gap:15px}.helpdesk-message{max-width:100%}.helpdesk-bubble{padding:13px 15px;font-size:15px}.answer-content{font-size:15px}.answer-table{font-size:13px}.helpdesk-form{gap:7px;padding:10px}.helpdesk-upload,.helpdesk-send{width:44px;min-width:44px;height:44px}}
      `}</style>

      <div className="helpdesk-header">
        <div className="helpdesk-avatar"><Sparkles size={19} /></div>
        <div>
          <h2>CampusResolve AI Helpdesk</h2>
          <p>Vignan University Student Support Assistant</p>
        </div>
      </div>

      <div className="helpdesk-messages">
        {messages.map(message => (
          <div key={message.id} className={`helpdesk-message ${message.role}`}>
            <div className="helpdesk-avatar">
              {message.role === 'assistant' ? <Bot size={17} /> : <User size={17} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="helpdesk-bubble">
                {message.role === 'assistant' ? renderFormattedAnswer(message.text) : message.text}
              </div>

              {message.showFeedback && (
                <div className="feedback-card">
                  {message.feedbackSubmitted ? (
                    <div className="feedback-success">✓ Thank you! Your feedback was submitted.</div>
                  ) : (
                    <>
                      <div className="feedback-title"><MessageSquare size={15} /> Rate this AI answer</div>
                      <div className="feedback-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            className={`feedback-star ${(message.rating || 0) >= star ? 'selected' : ''}`}
                            aria-label={`${star} star rating`}
                            onClick={() => updateMessage(message.id, { rating: star, feedbackError: '' })}
                          >
                            <Star size={23} fill={(message.rating || 0) >= star ? 'currentColor' : 'none'} />
                          </button>
                        ))}
                      </div>
                      <div className="feedback-title">Was this answer helpful?</div>
                      <div className="feedback-actions">
                        <button type="button" className={`feedback-choice ${message.helpful === true ? 'selected' : ''}`} onClick={() => updateMessage(message.id, { helpful: true, feedbackError: '' })}><ThumbsUp size={14} /> Yes</button>
                        <button type="button" className={`feedback-choice ${message.helpful === false ? 'selected' : ''}`} onClick={() => updateMessage(message.id, { helpful: false, feedbackError: '' })}><ThumbsDown size={14} /> No</button>
                      </div>
                      <textarea className="feedback-comment" value={message.comments || ''} onChange={event => updateMessage(message.id, { comments: event.target.value })} placeholder="Additional comments (optional)" maxLength={2000} />
                      {message.feedbackError && <div className="feedback-error">{message.feedbackError}</div>}
                      <button type="button" className="feedback-submit" disabled={!message.rating || !!message.feedbackLoading} onClick={() => void submitFeedback(message)}>{message.feedbackLoading ? 'Submitting...' : 'Submit Feedback'}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && <div className="helpdesk-typing">AI Assistant is preparing your answer...</div>}
        {uploading && <div className="helpdesk-typing"><LoaderCircle size={14} className="upload-spinner" /> Uploading {uploadName} to the knowledge base...</div>}
        <div ref={bottomRef} />
      </div>

      <form className="helpdesk-form" onSubmit={sendQuestion}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={handleFileSelection}
        />
        <button
          className="helpdesk-upload"
          type="button"
          title="Upload a university document (PDF, TXT, DOCX)"
          aria-label="Upload a university document"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={19} />
        </button>
        <textarea
          value={question}
          onChange={event => setQuestion(event.target.value)}
          placeholder="Ask about academics, exams, hostel, transport..."
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="helpdesk-send" type="submit" disabled={loading || !question.trim()} aria-label="Send question"><Send size={18} /></button>
      </form>
      {uploadError && <div className="helpdesk-upload-status helpdesk-upload-error">{uploadError}</div>}
      {!uploadError && uploading && <div className="helpdesk-upload-status">Uploading {uploadName}...</div>}
    </div>
  );
}
