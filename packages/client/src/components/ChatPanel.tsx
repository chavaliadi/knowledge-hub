import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Sparkles, Trash2, X, Loader2, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { Entry } from '../lib/types';

interface Citation {
  index: number;
  id: string;
  title: string;
  type: string;
  url?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  loading?: boolean;
  error?: boolean;
}

interface ChatPanelProps {
  onViewEntry: (entry: Entry) => void;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ChatPanel({ onViewEntry }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hello! I am your AI Knowledge Assistant. Ask me anything about your saved notes, bookmarks, code snippets, or resources, and I will synthesize an answer from your personal library.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleClearChat = () => {
    if (confirm('Clear chat history?')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: 'Hello! I am your AI Knowledge Assistant. Ask me anything about your saved notes, bookmarks, code snippets, or resources, and I will synthesize an answer from your personal library.',
        },
      ]);
    }
  };

  const handleCitationClick = async (entryId: string) => {
    try {
      const entry = await api.getEntryById(entryId);
      if (entry) {
        onViewEntry(entry);
      } else {
        alert('Could not open this save. It may have been deleted.');
      }
    } catch (err) {
      console.error('Failed to fetch cited entry:', err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMessageText = input.trim();
    setInput('');
    setIsGenerating(true);

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      text: userMessageText,
    };

    const assistantMsgId = Math.random().toString(36).substring(7);
    const initialAssistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      loading: true,
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);

    try {
      // Fetch session token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: userMessageText }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No stream body returned');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamText = '';
      let activeCitations: Citation[] = [];

      // Remove loading state on start of streaming data reception
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, loading: false } : msg
        )
      );

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);

                // Handle initial citations block
                if (parsed.citations && Array.isArray(parsed.citations)) {
                  activeCitations = parsed.citations;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? { ...msg, citations: activeCitations }
                        : msg
                    )
                  );
                }

                // Handle streaming text chunks
                if (parsed.text) {
                  streamText += parsed.text;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? { ...msg, text: streamText }
                        : msg
                    )
                  );
                }

                // Handle error message
                if (parsed.error) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? { ...msg, text: parsed.error, error: true }
                        : msg
                    )
                  );
                }
              } catch (err) {
                // Ignore parser issues
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('SSE streaming error:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                loading: false,
                error: true,
                text: `An error occurred while generating a response: ${err.message || 'Server connection issue.'}`,
              }
            : msg
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center justify-center p-4 rounded-full text-white shadow-2xl transition-all scale-100 hover:scale-[1.03] active:scale-[0.98] select-none
          ${
            isOpen
              ? 'bg-rose-600 shadow-rose-600/10'
              : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25 glow-text'
          }
        `}
      >
        {isOpen ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {/* Floating Chat Window Panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-[92vw] sm:w-[420px] h-[550px] glass-card border border-brand-border/60 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-brand-border/40 bg-brand-card/30">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-brand-accentLight">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-brand-textMain">AI Knowledge Assistant</h3>
                <span className="text-[9px] font-semibold text-brand-textMuted uppercase tracking-wider">
                  Retrieval Grounded (RAG)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleClearChat}
                className="p-1.5 rounded-lg hover:bg-brand-border/30 text-brand-textMuted hover:text-brand-textMain transition-all"
                title="Clear chat history"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-brand-border/30 text-brand-textMuted hover:text-brand-textMain transition-all"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages List Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-brand-dark/20">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] ${isUser ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                >
                  {/* Bubble */}
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed font-medium whitespace-pre-wrap
                      ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                          : msg.error
                          ? 'bg-red-500/10 border border-red-500/20 text-red-400 rounded-bl-none'
                          : 'bg-brand-card border border-brand-border/40 text-brand-textMain rounded-bl-none'
                      }
                    `}
                  >
                    {msg.loading ? (
                      <div className="flex items-center gap-2 text-brand-textMuted">
                        <Loader2 size={12} className="animate-spin text-brand-accentLight" />
                        <span>Searching database & preparing answer...</span>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>

                  {/* Grounded Citation Sources */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 space-y-1 w-full">
                      <span className="text-[9px] font-bold text-brand-textMuted/75 uppercase tracking-wider block">
                        Cited Sources:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((cit) => (
                          <button
                            key={cit.id}
                            onClick={() => handleCitationClick(cit.id)}
                            className="inline-flex items-center gap-1 bg-brand-card hover:bg-brand-border/40 border border-brand-border/50 hover:border-brand-border px-2 py-0.5 rounded-md text-[10px] font-semibold text-brand-accentLight transition-all select-none"
                          >
                            <BookOpen size={10} />
                            <span>
                              [{cit.index}] {cit.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box Form */}
          <form
            onSubmit={handleSend}
            className="p-3 border-t border-brand-border/40 bg-brand-card/20 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your saves..."
              disabled={isGenerating}
              className="flex-1 bg-brand-dark border border-brand-border px-3 py-2 rounded-xl text-xs text-brand-textMain placeholder-brand-textMuted/45 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-dark/80 disabled:opacity-50 transition-all font-medium"
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 text-white rounded-xl shadow-lg transition-all active:scale-[0.97]"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
