import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Code2,
  Check,
  Copy,
  RotateCcw,
  Zap,
  ArrowRight,
  Brain,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Key,
  Info,
  ShieldAlert,
  Database,
  Lock,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { DynamicVisualization } from './DynamicVisualization';
import { copilotApi } from '../../services/api/copilotApi';
import { ChatMessage, DataSource, NavigationPage } from '../../types';

export interface AICopilotCardProps {
  sources?: DataSource[];
  activeSourceName?: string;
  onNavigate?: (page: NavigationPage, context?: any) => void;
}

export const AICopilotCard: React.FC<AICopilotCardProps> = ({
  sources = [],
  activeSourceName = 'No connected source',
  onNavigate,
}) => {
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputPrompt, setInputPrompt] = useState('');
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);
  const [expandedSqlIds, setExpandedSqlIds] = useState<Record<string, boolean>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const [selectedSourceId, setSelectedSourceId] = useState<string>('');

  useEffect(() => {
    if (sources.length === 0) {
      setSelectedSourceId('');
      return;
    }

    if (!sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(sources[0].id);
    }
  }, [sources, selectedSourceId]);

  const targetSource = sources.find((source) => source.id === selectedSourceId);
  const targetSourceId = targetSource
    ? parseInt(targetSource.id, 10)
    : undefined;
  const currentSourceName = targetSource?.name || activeSourceName;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: `👋 Hello! I am your **Pi AI Copilot** connected to **${currentSourceName}**.\n\nYou can ask any natural-language analytics question against your connected Snowflake warehouse. Every SQL query is synthesized dynamically by Gemini, validated for read-only security, and executed against real data.`,
    },
  ]);

  useEffect(() => {
    if (messages.length > 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isProcessing]);

  const toggleSql = (msgId: string) => {
    setExpandedSqlIds((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleCopySql = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 1800);
  };

  const handleExecutePrompt = async (promptText: string) => {
    if (!promptText.trim() || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: promptText.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    setIsExpanded(true);

    try {
      // Execute query via real /api/copilot/query pipeline
      const res = await copilotApi.askQuery({
        question: promptText.trim(),
        source_id: targetSourceId,
      });

      if (res.success) {
        const aiMsg: ChatMessage = {
          id: `msg_ai_${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: res.answer,
          sqlQuery: res.sql || undefined,
          visualization: res.visualization || undefined,
          columns: res.columns || [],
          rows: res.rows || [],
          rowCount: res.row_count,
          executionTimeMs: res.execution_time_ms,
        };
        // Auto-expand SQL for visibility
        if (res.sql) {
          setExpandedSqlIds((prev) => ({ ...prev, [aiMsg.id]: true }));
        }
        setMessages((prev) => [...prev, aiMsg]);
        showToast('success', 'Real Query Executed', `Snowflake returned ${res.row_count} rows (${res.execution_time_ms}ms).`);
      } else {
        // Truthful response / error (no fake data)
        const isAuthError =
          (res.error && (res.error.toLowerCase().includes('password') || res.error.toLowerCase().includes('credential') || res.error.toLowerCase().includes('auth') || res.error.toLowerCase().includes('login'))) ||
          (res.answer && (res.answer.toLowerCase().includes('credential') || res.answer.toLowerCase().includes('password')));

        const errorMsg: ChatMessage = {
          id: `msg_ai_err_${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: res.answer || res.error || 'Query execution could not be completed.',
          sqlQuery: res.sql || undefined,
        };
        setMessages((prev) => [...prev, errorMsg]);

        if (isAuthError) {
        } else {
          showToast('error', 'Query Notice', res.answer || res.error || 'Unable to execute query.');
        }
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg_ai_err_${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `Error communicating with analytics backend: ${err?.message || 'Server error'}. Please verify your network connection and try again.`,
      };
      setMessages((prev) => [...prev, errorMsg]);
      showToast('error', 'Execution Error', err?.message || 'Unable to communicate with Copilot API.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isProcessing) return;
    const p = inputPrompt;
    setInputPrompt('');
    handleExecutePrompt(p);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `msg_welcome_${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `Conversation reset. How can I assist with your data in **${currentSourceName}**?`,
      },
    ]);
    showToast('info', 'Chat Reset', 'AI Copilot conversation restored.');
  };

  return (
    <div
      id="ai-copilot-section"
      className="rounded-xl border border-neutral-300 bg-white p-5 lg:p-6 shadow-xs space-y-5 scroll-mt-20"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-black tracking-tight font-sans">
                Pi AI Copilot
              </h2>
              <Badge variant="black" size="xs">
                Live Data Analyst
              </Badge>              <div className="flex items-center gap-2">
                <Database className="w-3 h-3 text-neutral-400" />
                <label className="text-[10px] font-semibold text-neutral-500">
                  Data Source
                </label>
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  disabled={isProcessing || sources.length === 0}
                  className="h-7 min-w-[190px] rounded-md border border-neutral-300 bg-white px-2 text-[11px] font-semibold text-neutral-800 outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sources.length === 0 ? (
                    <option value="">No connected source</option>
                  ) : (
                    sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.platform === 'salesforce' ? 'Salesforce' : 'Snowflake'} � {source.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            <p className="text-xs text-neutral-600 font-medium mt-0.5">
              Ask any natural-language analytics question. SQL is dynamically synthesized by Gemini and executed against real Snowflake data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetChat}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            className="text-xs font-semibold"
          >
            Reset
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            rightIcon={isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            className="text-xs font-semibold"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </div>

      {/* 4 Core Pillars of AI Copilot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <Brain className="w-4 h-4 text-black shrink-0" />
            <span>Any Question</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Ask arbitrary questions in natural English. No predefined question limits.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <TrendingUp className="w-4 h-4 text-black shrink-0" />
            <span>Real Visualizations</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Charts and KPIs dynamically derived from actual returned warehouse rows.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <Zap className="w-4 h-4 text-black shrink-0" />
            <span>Read-Only Governed</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Strict AST and regex security allows only SELECT queries, preventing mutation.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <Code2 className="w-4 h-4 text-black shrink-0" />
            <span>Dynamic SQL</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Inspect, copy, and verify real SQL generated directly against catalog schema.
          </p>
        </div>
      </div>

      {/* Interactive Conversation View (when expanded) */}
      {isExpanded && (
        <div className="rounded-lg border border-neutral-200 bg-[#fafaf9] overflow-hidden shadow-2xs">
          <div className="max-h-[500px] overflow-y-auto p-4 space-y-3.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Sender Header */}
                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-500">
                  <span className="font-bold text-black">
                    {msg.sender === 'user' ? 'You' : 'Pi Copilot AI'}
                  </span>
                  <span>•</span>
                  <span className="font-mono-code">{msg.timestamp}</span>
                  {msg.rowCount !== undefined && (
                    <>
                      <span>•</span>
                      <span className="text-neutral-600 font-mono-code">
                        {msg.rowCount} rows ({msg.executionTimeMs}ms)
                      </span>
                    </>
                  )}
                </div>

                {/* Chat Bubble */}
                <div
                  className={`p-4 rounded-lg max-w-[94%] sm:max-w-[88%] leading-relaxed text-xs ${
                    msg.sender === 'user'
                      ? 'bg-black text-white font-medium shadow-xs'
                      : 'bg-white text-black border border-neutral-200 shadow-xs space-y-3'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-medium">{msg.content}</div>

                  {/* Real Dynamic Visualization from Actual Result Rows */}
                  {msg.visualization && msg.rows && msg.rows.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100">
                      <DynamicVisualization
                        spec={msg.visualization}
                        columns={msg.columns || []}
                        rows={msg.rows || []}
                        height={220}
                      />
                    </div>
                  )}

                  {/* Generated SQL Expandable Section */}
                  {msg.sqlQuery && (
                    <div className="pt-2 border-t border-neutral-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-black font-mono-code font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSql(msg.id)}
                          className="flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <Code2 className="w-3.5 h-3.5 text-black" />
                          <span>Generated SQL Query</span>
                          {expandedSqlIds[msg.id] ? (
                            <ChevronUp className="w-3 h-3 text-neutral-500" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-neutral-500" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopySql(msg.sqlQuery!, msg.id)}
                          className="text-black hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          {copiedSqlId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-black" />
                              <span>Copy SQL</span>
                            </>
                          )}
                        </button>
                      </div>

                      {expandedSqlIds[msg.id] && (
                        <pre className="p-3 bg-neutral-900 text-neutral-100 rounded-md text-[11px] font-mono-code overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                          {msg.sqlQuery}
                        </pre>
                      )}
                    </div>
                  )}
                    </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-500">
                  <span className="font-bold text-black">Pi Copilot AI</span>
                  <span>•</span>
                  <span className="font-mono-code">Synthesizing SQL &amp; Querying Snowflake...</span>
                </div>
                <div className="p-3.5 rounded-lg bg-white border border-neutral-200 text-black flex items-center gap-2.5 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                  <span className="text-xs font-semibold">
                    Synthesizing query with Gemini, validating read-only AST, and executing against connected warehouse...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Prompt Input Form */}
      <div className="space-y-2.5">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Ask any analytics question (e.g. 'What is the total revenue by region?', 'Which product sold the most?')..."
              className="w-full text-xs font-medium text-black bg-white border border-neutral-300 rounded-md py-2.5 px-3.5 pr-10 focus:border-black focus:ring-1 focus:ring-black focus:outline-none shadow-2xs placeholder:text-neutral-500"
            />
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isProcessing}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white bg-black rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
              title="Send question to AI Copilot"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!inputPrompt.trim() || isProcessing}
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            className="hidden sm:inline-flex shrink-0 font-semibold"
          >
            Ask Copilot
          </Button>
        </form>
      </div>
    </div>
  );
};






