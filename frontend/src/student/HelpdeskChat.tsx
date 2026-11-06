import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
} from 'lucide-react';

const API =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

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

  function renderInline(text: string): ReactNode[] {
    return text.split(/(\*\*.*?\*\*)/g).map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  function renderFormattedAnswer(text: string): ReactNode {
    const lines = text.split('\n');
    const blocks: ReactNode[] = [];
    let i = 0;

    const cells = (line: string) =>
      line.trim().replace(/^\|/, '').replace(/\|$/, '')
        .split('|').map(cell => cell.trim());

    const isSeparator = (line: string) =>
      cells(line).every(cell => /^:?-{3,}:?$/.test(cell));

    while (i < lines.length) {
      const line = lines[i].trim();

      if (!line) {
        i++;
        continue;
      }

      // Markdown tables
      if (
        line.includes('|') &&
        i + 1 < lines.length &&
        isSeparator(lines[i + 1].trim())
      ) {
        const headers = cells(line);
        i += 2;

        const rows: string[][] = [];

        while (i < lines.length && lines[i].includes('|')) {
          rows.push(cells(lines[i]));
          i++;
        }

        blocks.push(
          <div className="answer-table-wrap" key={`table-${i}`}>
            <table className="answer-table">
              <thead>
                <tr>
                  {headers.map((cell, index) => (
                    <th key={index}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {headers.map((_, column) => (
                      <td key={column}>
                        {renderInline(row[column] || '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Headings
      if (/^#{1,3}\s/.test(line)) {
        blocks.push(
          <h3 key={i}>{renderInline(line.replace(/^#{1,3}\s/, ''))}</h3>
        );
        i++;
        continue;
      }

      // Bullet lists
      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];

        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
          i++;
        }

        blocks.push(
          <ul key={`list-${i}`}>
            {items.map((item, index) => (
              <li key={index}>{renderInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Normal paragraphs
      const paragraph = [line];
      i++;

      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^#{1,3}\s/.test(lines[i].trim()) &&
        !/^[-*]\s+/.test(lines[i].trim()) &&
        !(
          lines[i].includes('|') &&
          i + 1 < lines.length &&
          isSeparator(lines[i + 1].trim())
        )
      ) {
        paragraph.push(lines[i].trim());
        i++;
      }

      blocks.push(
        <p key={`paragraph-${i}`}>
          {renderInline(paragraph.join(' '))}
        </p>
      );
    }

    return <div className="answer-content">{blocks}</div>;
  }


  // Handle n8n array response
  if (Array.isArray(data)) {
    for (const item of data) {
      const answer = extractAnswer(item);
      if (answer) return answer;
    }
    return '';
  }

  if (!data || typeof data !== 'object') return '';

  // Direct answer fields
  for (const key of ['answer', 'response', 'output', 'text']) {
    const value = data[key];

    if (
      typeof value === 'string' &&
      value.trim() &&
      !/workflow was started/i.test(value)
    ) {
      return value.trim();
    }
  }

  // Nested response fields
  for (const key of [
    'n8n_response',
    'data',
    'result',
    'body',
  ]) {
    const answer = extractAnswer(data[key]);
    if (answer) return answer;
  }

  return '';
}

function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderFormattedAnswer(text: string): React.ReactNode {
  const lines = text.split('\n');

  return (
    <div className="answer-content">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) return <br key={index} />;

        if (/^#{1,3}\s/.test(trimmed)) {
          return (
            <h3 key={index}>
              {renderInline(trimmed.replace(/^#{1,3}\s/, ''))}
            </h3>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <p key={index}>
              • {renderInline(trimmed.replace(/^[-*]\s+/, ''))}
            </p>
          );
        }

        if (/^\|?[\s:-]+\|[\s|:-]*$/.test(trimmed)) {
          return null;
        }

        if (trimmed.includes('|')) {
          return null;
        }

        return <p key={index}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function updateMessage(id: string, changes: Partial<Message>) {
    setMessages(previous =>
      previous.map(message =>
        message.id === id
          ? { ...message, ...changes }
          : message
      )
    );
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = question.trim();
    if (!message || loading) return;

    const userId = `user-${Date.now()}`;

    setMessages(previous => [
      ...previous,
      {
        id: userId,
        role: 'user',
        text: message,
      },
    ]);

    setQuestion('');
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(
        `${API}/api/automation/supervisor`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event: 'knowledge.query',
            source: 'student_helpdesk',
            message,
            context: {},
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : 'Unable to get an AI answer.'
        );
      }

      const answer = extractAnswer(data);

      if (!answer) {
        throw new Error(
          'AI answer was not returned. Please check the Supervisor workflow.'
        );
      }

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
      setMessages(previous => [
        ...previous,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          text: error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(message: Message) {
    if (!accessToken) {
      updateMessage(message.id, {
        feedbackError: 'Please login again to submit feedback.',
      });
      return;
    }

    if (!message.rating) {
      updateMessage(message.id, {
        feedbackError: 'Please select a star rating.',
      });
      return;
    }

    updateMessage(message.id, {
      feedbackLoading: true,
      feedbackError: '',
    });

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

      if (!response.ok) {
        throw new Error(
          data.detail || 'Unable to submit feedback.'
        );
      }

      updateMessage(message.id, {
        feedbackSubmitted: true,
        feedbackLoading: false,
        feedbackError: '',
      });

    } catch (error) {
      updateMessage(message.id, {
        feedbackLoading: false,
        feedbackError: error instanceof Error
          ? error.message
          : 'Feedback submission failed.',
      });
    }
  }

  return (
    <div className="helpdesk-container">
      <style>{`
        .helpdesk-container {
          max-width: 850px;
          margin: 25px auto;
          background: white;
          border: 1px solid #e5eaf2;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(20,35,65,.07);
        }

        .helpdesk-header {
          padding: 20px;
          background: #202d53;
          color: white;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .helpdesk-header h2 {
          margin: 0;
          font-size: 17px;
        }

        .helpdesk-header p {
          margin: 4px 0 0;
          color: #d5def9;
          font-size: 11px;
        }

        .helpdesk-messages {
          min-height: 430px;
          max-height: 550px;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 17px;
          background: #f8faff;
        }

        .helpdesk-message {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          max-width: 90%;
        }

        .helpdesk-message.user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .helpdesk-avatar {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #e8ecff;
          color: #596de3;
        }

        .helpdesk-bubble {
          padding: 12px 15px;
          border-radius: 12px;
          background: white;
          border: 1px solid #e5eaf2;
          color: #34405b;
          font-size: 13px;
          line-height: 1.7;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .helpdesk-message.user .helpdesk-bubble {
          background: #596de3;
          color: white;
          border: 0;
        }

        .feedback-card {
          margin-top: 12px;
          padding: 13px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
        }

        .feedback-title {
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 9px;
          display: flex;
          gap: 7px;
          align-items: center;
        }

        .feedback-stars {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
        }

        .feedback-star {
          border: none;
          background: transparent;
          padding: 2px;
          cursor: pointer;
          color: #cbd5e1;
        }

        .feedback-star.selected {
          color: #f59e0b;
        }

        .feedback-actions {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .feedback-choice {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          border: 1px solid #dbe2ed;
          border-radius: 7px;
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          cursor: pointer;
        }

        .feedback-choice.selected {
          background: #eef2ff;
          border-color: #596de3;
          color: #3730a3;
        }

        .feedback-comment {
          width: 100%;
          box-sizing: border-box;
          min-height: 58px;
          resize: vertical;
          padding: 9px;
          border: 1px solid #dbe2ed;
          border-radius: 7px;
          font: inherit;
          font-size: 12px;
          margin-bottom: 10px;
        }

        .feedback-submit {
          border: none;
          border-radius: 7px;
          padding: 9px 15px;
          background: #596de3;
          color: white;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }

        .feedback-submit:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .feedback-success {
          font-size: 12px;
          color: #15803d;
          font-weight: 650;
        }

        .feedback-error {
          color: #b91c1c;
          font-size: 11px;
          margin: 5px 0;
        }

        .helpdesk-form {
          padding: 15px;
          display: flex;
          gap: 10px;
          border-top: 1px solid #edf0f5;
        }

        .helpdesk-form textarea {
          flex: 1;
          min-width: 0;
          resize: none;
          min-height: 45px;
          max-height: 100px;
          padding: 12px;
          border: 1px solid #dfe5ef;
          border-radius: 9px;
          font: inherit;
          font-size: 13px;
          outline: none;
        }

        .helpdesk-form textarea:focus {
          border-color: #697be6;
        }

        .helpdesk-send {
          width: 46px;
          border: 0;
          border-radius: 9px;
          background: #596de3;
          color: white;
          cursor: pointer;
        }

        .helpdesk-send:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .helpdesk-typing {
          color: #778399;
          font-size: 12px;
        }

        @media(max-width:600px) {
          .helpdesk-container {
            margin: 10px;
          }

          .helpdesk-messages {
            min-height: 400px;
          }
        }
          .answer-content {
  white-space: normal;
  line-height: 1.7;
  color: #34405b;
}

.answer-content p {
  margin: 0 0 12px;
}

.answer-content h3 {
  margin: 16px 0 9px;
  font-size: 15px;
  color: #202d53;
}

.answer-content ul {
  padding-left: 22px;
  margin: 8px 0 14px;
}

.answer-content li {
  margin-bottom: 7px;
}

.answer-table-wrap {
  overflow-x: auto;
  margin: 12px 0 16px;
}

.answer-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: white;
}

.answer-table th,
.answer-table td {
  padding: 11px;
  border: 1px solid #e2e8f0;
  text-align: left;
}

.answer-table th {
  background: #eef2ff;
  color: #202d53;
}
      `}</style>

      <div className="helpdesk-header">
        <div className="helpdesk-avatar">
          <Sparkles size={19} />
        </div>
        <div>
          <h2>CampusResolve AI Helpdesk</h2>
          <p>Vignan University Student Support Assistant</p>
        </div>
      </div>

      <div className="helpdesk-messages">
        {messages.map(message => (
          <div
            key={message.id}
            className={`helpdesk-message ${message.role}`}
          >
            <div className="helpdesk-avatar">
              {message.role === 'assistant'
                ? <Bot size={17} />
                : <User size={17} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="helpdesk-bubble">
                {message.role === 'assistant'
                  ? renderFormattedAnswer(message.text)
                  : message.text}
              </div>

              {message.showFeedback && (
                <div className="feedback-card">
                  {message.feedbackSubmitted ? (
                    <div className="feedback-success">
                      <CheckCircle2Icon />
                      Thank you! Your feedback was submitted.
                    </div>
                  ) : (
                    <>
                      <div className="feedback-title">
                        <MessageSquare size={15} />
                        Rate this AI answer
                      </div>

                      <div className="feedback-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            className={`feedback-star ${(message.rating || 0) >= star
                              ? 'selected'
                              : ''
                              }`}
                            aria-label={`${star} star rating`}
                            onClick={() =>
                              updateMessage(message.id, {
                                rating: star,
                                feedbackError: '',
                              })
                            }
                          >
                            <Star
                              size={23}
                              fill={
                                (message.rating || 0) >= star
                                  ? 'currentColor'
                                  : 'none'
                              }
                            />
                          </button>
                        ))}
                      </div>

                      <div className="feedback-title">
                        Was this answer helpful?
                      </div>

                      <div className="feedback-actions">
                        <button
                          type="button"
                          className={`feedback-choice ${message.helpful === true ? 'selected' : ''
                            }`}
                          onClick={() =>
                            updateMessage(message.id, {
                              helpful: true,
                              feedbackError: '',
                            })
                          }
                        >
                          <ThumbsUp size={14} />
                          Yes
                        </button>

                        <button
                          type="button"
                          className={`feedback-choice ${message.helpful === false ? 'selected' : ''
                            }`}
                          onClick={() =>
                            updateMessage(message.id, {
                              helpful: false,
                              feedbackError: '',
                            })
                          }
                        >
                          <ThumbsDown size={14} />
                          No
                        </button>
                      </div>

                      <textarea
                        className="feedback-comment"
                        value={message.comments || ''}
                        onChange={event =>
                          updateMessage(message.id, {
                            comments: event.target.value,
                          })
                        }
                        placeholder="Additional comments (optional)"
                        maxLength={2000}
                      />

                      {message.feedbackError && (
                        <div className="feedback-error">
                          {message.feedbackError}
                        </div>
                      )}

                      <button
                        type="button"
                        className="feedback-submit"
                        disabled={
                          !message.rating || !!message.feedbackLoading
                        }
                        onClick={() => void submitFeedback(message)}
                      >
                        {message.feedbackLoading
                          ? 'Submitting...'
                          : 'Submit Feedback'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="helpdesk-typing">
            AI Assistant is preparing your answer...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form className="helpdesk-form" onSubmit={sendQuestion}>
        <textarea
          value={question}
          onChange={event => setQuestion(event.target.value)}
          placeholder="Ask about academics, exams, hostel, transport..."
          onKeyDown={event => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />

        <button
          className="helpdesk-send"
          type="submit"
          disabled={loading || !question.trim()}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function CheckCircle2Icon() {
  return <span style={{ marginRight: 6 }}>✓</span>;
}
