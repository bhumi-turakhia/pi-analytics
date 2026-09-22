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
  Plus,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { PiByThreeIcon } from '../brand/Logo';
import { ChatMessage, DashboardState } from '../../types';
import { DynamicVisualization } from './DynamicVisualization';

export interface DashboardAICopilotProps {
  dashboardState: DashboardState;
  onExecutePrompt: (prompt: string) => void;
  isProcessing: boolean;
  messages: ChatMessage[];
  onResetChat: () => void;
  onAddToDashboard?: (msg: ChatMessage) => void;
}

export const DashboardAICopilot: React.FC<DashboardAICopilotProps> = ({
  dashboardState,
  onExecutePrompt,
  isProcessing,
  messages,
  onResetChat,
  onAddToDashboard,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);
  const [expandedSqlIds, setExpandedSqlIds] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'Show sales by region',
    'Show monthly revenue',
    'What is total revenue?',
    'How many customers do we have?',
    'Show the top 10 products by revenue',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isProcessing) return;
    const promptToSend = inputPrompt.trim();
    setInputPrompt('');
    onExecutePrompt(promptToSend);
  };

  const handleCopySql = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 1800);
  };

  const toggleSql = (id: string) => {
    setExpandedSqlIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="h-full flex flex-col bg-white text-black">
      {/* Header */}
      <div className="p-3.5 border-b border-neutral-200 bg-[#fafaf9] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <PiByThreeIcon size={28} />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-black">AI Analytics Copilot</h3>
              <Badge variant="black" size="xs">
                Live Analyst
              </Badge>
            </div>
            <p className="text-[10px] text-neutral-600 font-mono-code truncate max-w-[170px]">
              Source: {dashboardState.sourceName}
            </p>
          </div>
        </div>

        <button
          onClick={onResetChat}
          title="Reset conversation"
          className="p-1.5 text-neutral-600 hover:text-black rounded hover:bg-neutral-200/70 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Suggested Quick Analytical Prompts */}
      <div className="p-2.5 bg-[#fdfdfc] border-b border-neutral-200">
        <div className="text-[10px] font-bold text-black uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Zap className="w-3 h-3 text-black" />
          <span>Quick Questions:</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {quickPrompts.slice(0, 3).map((prompt, idx) => (
            <button
              key={idx}
              disabled={isProcessing}
              onClick={() => onExecutePrompt(prompt)}
              className="text-left text-[11px] font-medium px-2 py-1 bg-white hover:bg-black hover:text-white border border-neutral-300 rounded text-black transition-all truncate max-w-full cursor-pointer disabled:opacity-50"
            >
              • {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-4 text-xs bg-[#fafaf9]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* Sender Label & Timestamp */}
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-600">
              <span className="font-bold text-black">
                {msg.sender === 'user' ? 'You' : 'Pi Copilot AI'}
              </span>
              <span>•</span>
              <span className="font-mono-code">{msg.timestamp}</span>
            </div>

            {/* Bubble */}
            <div
              className={`p-3.5 rounded-lg max-w-[98%] leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-black text-white shadow-xs font-medium'
                  : 'bg-white text-black border border-neutral-200 shadow-xs space-y-3'
              }`}
            >
              {/* Message text content */}
              <div className="whitespace-pre-wrap font-medium">{msg.content}</div>

              {/* REAL DATA VISUALIZATION EMBEDDED IN COPILOT */}
              {msg.visualization && msg.rows && msg.rows.length > 0 && (
                <div className="pt-2 pb-1 border-t border-neutral-200">
                  <DynamicVisualization
                    spec={msg.visualization}
                    columns={msg.columns || []}
                    rows={msg.rows}
                    height={190}
                  />
                </div>
              )}

              {/* ADD TO DASHBOARD ACTION */}
              {msg.canAddToDashboard && (
                <div className="pt-2 flex items-center justify-between border-t border-neutral-200">
                  {msg.isAddedToDashboard ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Added to Dashboard
                    </span>
                  ) : (
                    <button
                      onClick={() => onAddToDashboard && onAddToDashboard(msg)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-black hover:bg-neutral-800 px-3 py-1.5 rounded-md transition-all cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add to Dashboard
                    </button>
                  )}
                  {msg.rows && (
                    <span className="text-[10px] text-neutral-500 font-mono-code">
                      {msg.rows.length} rows returned
                    </span>
                  )}
                </div>
              )}

              {/* Generated SQL Section with Collapsible View */}
              {msg.sqlQuery && (
                <div className="space-y-1.5 pt-1 border-t border-neutral-200">
                  <div className="flex items-center justify-between text-[10px] text-neutral-700 font-mono-code font-semibold">
                    <button
                      onClick={() => toggleSql(msg.id)}
                      className="flex items-center gap-1.5 hover:text-black font-bold cursor-pointer"
                    >
                      <Code2 className="w-3 h-3 text-black" />
                      <span>{expandedSqlIds[msg.id] ? 'Hide SQL' : 'View SQL'}</span>
                      {msg.sqlExecuted ? (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-sans font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          Executed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-sans font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                          <Info className="w-2.5 h-2.5 text-amber-700" />
                          Not executed
                        </span>
                      )}
                      {expandedSqlIds[msg.id] ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    <button
                      onClick={() => handleCopySql(msg.sqlQuery!, msg.id)}
                      className="text-black hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                    >
                      {copiedSqlId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-black" />
                      )}
                      <span>{copiedSqlId === msg.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {!msg.sqlExecuted && (
                    <div className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 font-sans leading-relaxed">
                      <span className="font-semibold">Execution Status: </span>
                      <span>Not executed</span>
                      {msg.notExecutedReason && (
                        <div className="text-neutral-700 mt-0.5">{msg.notExecutedReason}</div>
                      )}
                    </div>
                  )}

                  {expandedSqlIds[msg.id] && (
                    <pre className="p-2.5 bg-neutral-900 text-neutral-100 rounded-md text-[10.5px] font-mono-code overflow-x-auto whitespace-pre leading-snug shadow-inner">
                      {msg.sqlQuery}
                    </pre>
                  )}
                </div>
              )}

              {/* Applied Changes List if present */}
              {msg.appliedChanges && msg.appliedChanges.length > 0 && (
                <div className="pt-2 border-t border-neutral-200 space-y-1">
                  <div className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-700 font-bold" />
                    <span>Applied Changes:</span>
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-black">
                    {msg.appliedChanges.map((change, i) => (
                      <li key={i} className="flex items-start gap-1 font-medium">
                        <span className="text-emerald-700 font-bold">✓</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Follow-up suggestions */}
              {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                <div className="pt-2 border-t border-neutral-200">
                  <div className="text-[10px] text-neutral-600 font-bold mb-1">
                    Suggested follow-up questions:
                  </div>
                  <div className="flex flex-col gap-1">
                    {msg.suggestedFollowUps.map((fu, idx) => (
                      <button
                        key={idx}
                        disabled={isProcessing}
                        onClick={() => onExecutePrompt(fu)}
                        className="text-left text-[11px] text-black hover:text-neutral-800 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <ArrowRight className="w-2.5 h-2.5 text-black shrink-0" />
                        <span>{fu}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-600">
              <span className="font-bold text-black">Pi Copilot AI</span>
              <span>•</span>
              <span className="font-mono-code">Analyzing warehouse...</span>
            </div>
            <div className="p-3.5 rounded-lg bg-white border border-neutral-200 text-black flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-black animate-ping" />
              <span className="text-[11px] font-semibold">
                Checking catalog, generating safe SQL, and querying warehouse...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Prompt Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-neutral-200 bg-white">
        <div className="relative">
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask a question (e.g., 'Show sales by region', 'Show monthly revenue')..."
            rows={2}
            className="w-full text-xs text-black font-medium bg-[#fafaf9] border border-neutral-300 rounded-md p-2.5 pr-10 focus:border-black focus:ring-1 focus:ring-black focus:outline-none placeholder:text-neutral-500 resize-none shadow-xs"
          />

          <button
            type="submit"
            disabled={!inputPrompt.trim() || isProcessing}
            className="absolute right-2.5 bottom-3.5 p-1.5 rounded-md bg-black text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
            title="Ask Copilot"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-600 font-medium">
          <span>Catalog-grounded analytical queries</span>
          <span className="font-mono-code text-black font-bold">Step 9 Safety Verified</span>
        </div>
      </form>
    </div>
  );
};
