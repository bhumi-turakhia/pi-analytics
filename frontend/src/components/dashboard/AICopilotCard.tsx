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
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PiByThreeIcon } from '../brand/Logo';
import { ChatMessage, DashboardState } from '../../types';
import { executeDashboardPrompt, generateInitialDashboard } from '../../services/dashboardService';
import { aiApi } from '../../services/api';
import type { AICopilotRequest } from '../../services/api/aiApi';
import { useToast } from '../ui/Toast';

export interface AICopilotCardProps {
  activeSourceName?: string;
}

export const AICopilotCard: React.FC<AICopilotCardProps> = ({
  activeSourceName = 'Snowflake Retail Analytics & Salesforce CRM',
}) => {
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputPrompt, setInputPrompt] = useState('');
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const [dashboardState, setDashboardState] = useState<DashboardState>(() =>
    generateInitialDashboard({ name: activeSourceName, platform: 'snowflake' })
  );

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: `👋 Hello! I am your **Pi AI Copilot** connected to **${activeSourceName}**.\n\nYou can ask me natural language questions about your enterprise metrics, compute moving averages, filter specific deal thresholds, or synthesize SQL queries in real time.`,
      suggestedFollowUps: [
        'Group revenue by region and show top 5 performers',
        'Highlight enterprise deals >$100K and calculate gross margin',
        'Switch trend to 14-day moving average and add profit margin',
      ],
    },
  ]);

  const samplePrompts = [
    'Group revenue by region and show top 5 performers',
    'Highlight enterprise deals >$100K and calculate gross margin',
    'Switch trend to 14-day moving average and add profit margin',
    'Convert pipeline to stage conversion funnel',
  ];

  useEffect(() => {
    if (messages.length > 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isProcessing]);

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
      // ── Step 10: Try real Gemini AI endpoint ─────────────────────────
      const aiRequest: AICopilotRequest = {
        source_name: activeSourceName,
        platform: 'snowflake',
        prompt: promptText,
        dashboard_context: {
          sourceName: dashboardState.sourceName,
          platform: dashboardState.platform,
          activeFilter: dashboardState.activeFilter,
          kpis: dashboardState.kpis.map((k) => ({
            id: k.id,
            label: k.label,
            value: k.value,
            change: k.change,
            isPositive: k.isPositive,
          })),
        },
      };

      let usedAI = false;
      try {
        const aiResponse = await aiApi.sendPrompt(aiRequest);
        if (aiResponse.success) {
          usedAI = true;
          // Apply lightweight dashboard mutations
          const next: DashboardState = { ...dashboardState };
          const mut = aiResponse.dashboard_mutation;
          if (mut) {
            if (mut.insights && mut.insights.length > 0) next.insights = mut.insights;
            if (mut.subtitle) next.subtitle = mut.subtitle;
          }
          next.lastPromptExecuted = promptText;
          setDashboardState(next);

          const aiMsg: ChatMessage = {
            id: `msg_ai_${Date.now()}`,
            sender: 'assistant',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            content: aiResponse.explanation,
            sqlQuery: aiResponse.sql_query || undefined,
            appliedChanges: aiResponse.applied_changes,
            suggestedFollowUps: aiResponse.suggested_follow_ups,
          };
          setMessages((prev) => [...prev, aiMsg]);
          showToast('success', 'Copilot Answered', `Gemini analyzed: "${promptText}"`);
        }
      } catch (aiErr: any) {
        // 503 = no key configured, silently fall through to simulation
        if (aiErr?.code !== 503) {
          console.warn('[AI Copilot] Gemini error, using simulation:', aiErr?.message);
        }
      }

      // ── Fallback: client-side simulation ─────────────────────────────
      if (!usedAI) {
        await new Promise((resolve) => setTimeout(resolve, 550));
        const { updatedDashboard, responseMessage } = executeDashboardPrompt(dashboardState, promptText);
        setDashboardState(updatedDashboard);
        setMessages((prev) => [...prev, responseMessage]);
        showToast('success', 'Copilot Answered', `Processed query: "${promptText}"`);
      }
    } catch {
      showToast('error', 'Execution Error', 'Unable to process query against data catalog.');
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
    const initial = generateInitialDashboard({ name: activeSourceName, platform: 'snowflake' });
    setDashboardState(initial);
    setMessages([
      {
        id: `msg_welcome_${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `Conversation reset. How can I assist with your data in **${activeSourceName}**?`,
        suggestedFollowUps: [
          'Group revenue by region and show top 5 performers',
          'Highlight enterprise deals >$100K and calculate gross margin',
        ],
      },
    ]);
    showToast('info', 'Chat Cleared', 'AI Copilot conversation restored to initial state.');
  };

  const handleCopySql = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 1800);
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
              <h2 className="text-base font-bold text-black tracking-tight">
                Pi AI Copilot
              </h2>
              <Badge variant="black" size="xs">
                Live Data Analyst
              </Badge>
              <span className="text-[11px] text-neutral-500 font-mono-code">
                Connected to: {activeSourceName}
              </span>
            </div>
            <p className="text-xs text-neutral-600 font-medium mt-0.5">
              Ask natural language questions to analyze metrics, generate SQL, and extract actionable insights.
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
            Reset Chat
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            rightIcon={isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            className="text-xs font-semibold"
          >
            {isExpanded ? 'Collapse Chat' : 'Expand Chat'}
          </Button>
        </div>
      </div>

      {/* 4 Core Pillars of AI Copilot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <Brain className="w-4 h-4 text-black shrink-0" />
            <span>Ask Questions</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Query tables and business metrics in plain English without writing manual SQL.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <TrendingUp className="w-4 h-4 text-black shrink-0" />
            <span>Dynamic Metrics</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Instantly adjust moving averages, calculate win rates, and compare regions.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <Zap className="w-4 h-4 text-black shrink-0" />
            <span>Generate Insights</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Receive automated real-time executive takeaway bullet points and anomaly flags.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-[#fafaf9] border border-neutral-200 space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-black">
            <Code2 className="w-4 h-4 text-black shrink-0" />
            <span>SQL Synthesis</span>
          </div>
          <p className="text-[11px] text-neutral-600 font-normal leading-relaxed">
            Inspect, copy, and execute synthesized Snowflake &amp; PostgreSQL queries.
          </p>
        </div>
      </div>

      {/* Interactive Conversation View (when expanded) */}
      {isExpanded && (
        <div className="rounded-lg border border-neutral-200 bg-[#fafaf9] overflow-hidden shadow-2xs">
          <div className="max-h-96 overflow-y-auto p-4 space-y-3.5">
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
                </div>

                {/* Chat Bubble */}
                <div
                  className={`p-3.5 rounded-lg max-w-[92%] sm:max-w-[85%] leading-relaxed text-xs ${
                    msg.sender === 'user'
                      ? 'bg-black text-white font-medium shadow-xs'
                      : 'bg-white text-black border border-neutral-200 shadow-xs space-y-2.5'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Applied Changes List */}
                  {msg.appliedChanges && msg.appliedChanges.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100 space-y-1">
                      <div className="text-[10px] font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-700 font-bold" />
                        <span>Insights &amp; Applied Transformations:</span>
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

                  {/* Generated SQL */}
                  {msg.sqlQuery && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-black font-mono-code font-semibold">
                        <span className="flex items-center gap-1">
                          <Code2 className="w-3 h-3 text-black" />
                          Generated SQL Query:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopySql(msg.sqlQuery!, msg.id)}
                          className="text-black hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                        >
                          {copiedSqlId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-black" />
                          )}
                          <span>{copiedSqlId === msg.id ? 'Copied' : 'Copy SQL'}</span>
                        </button>
                      </div>
                      <pre className="p-2.5 bg-neutral-900 text-neutral-100 rounded text-[10px] font-mono-code overflow-x-auto whitespace-pre leading-snug">
                        {msg.sqlQuery}
                      </pre>
                    </div>
                  )}

                  {/* Suggested Follow-ups */}
                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100 space-y-1">
                      <div className="text-[10px] text-neutral-500 font-bold">
                        Suggested next questions:
                      </div>
                      <div className="flex flex-col gap-1">
                        {msg.suggestedFollowUps.map((fu, idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleExecutePrompt(fu)}
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
                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-500">
                  <span className="font-bold text-black">Pi Copilot AI</span>
                  <span>•</span>
                  <span className="font-mono-code">Analyzing...</span>
                </div>
                <div className="p-3 rounded-lg bg-white border border-neutral-200 text-black flex items-center gap-2 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                  <span className="text-[11px] font-semibold">
                    Recomputing metrics &amp; analyzing warehouse partitions...
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
              placeholder="Ask AI Copilot (e.g., 'Group revenue by region and calculate gross margin')..."
              className="w-full text-xs font-medium text-black bg-white border border-neutral-300 rounded-md py-2.5 px-3.5 pr-10 focus:border-black focus:ring-1 focus:ring-black focus:outline-none shadow-2xs placeholder:text-neutral-500"
            />
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isProcessing}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white bg-black rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
              title="Send prompt to AI Copilot"
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

        {/* Suggested Quick Questions */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="text-neutral-500 font-bold flex items-center gap-1 mr-1">
            <Zap className="w-3 h-3 text-black" />
            Quick Prompts:
          </span>
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isProcessing}
              onClick={() => handleExecutePrompt(prompt)}
              className="px-2.5 py-1 rounded bg-[#fafaf9] hover:bg-black hover:text-white border border-neutral-300 text-black font-medium transition-all text-left truncate max-w-xs cursor-pointer shadow-2xs disabled:opacity-50"
            >
              • {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
