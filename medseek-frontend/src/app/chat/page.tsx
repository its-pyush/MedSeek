"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import AuthGuard from "@/components/AuthGuard";
import {
  createChatSession,
  listChatSessions,
  getChatSession,
  sendChatMessage,
  ChatSession,
  ChatMessage,
} from "@/lib/chat";
import {
  IconConsultation,
  IconPlus,
  IconSend,
  IconMenu,
  IconClose,
  IconWarning,
  IconLockShield,
} from "@/components/icons";

function ChatContent() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function loadSessions() {
      try {
        const result = await listChatSessions();
        setSessions(result.sessions);
      } catch {
        /* ignore */
      }
    }
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [input]);

  async function handleNewSession() {
    try {
      const session = await createChatSession();
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
      setSidebarOpen(false);
    } catch {
      setError("Failed to initialize consultation session");
    }
  }

  async function handleSelectSession(sessionId: number) {
    try {
      setActiveSessionId(sessionId);
      const result = await getChatSession(sessionId);
      setMessages(result.messages);
      setSidebarOpen(false);
    } catch {
      setError("Failed to load consultation transcript");
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activeSessionId || isSending) return;

    const userContent = input.trim();
    setInput("");
    setIsSending(true);
    setError(null);

    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      session_id: activeSessionId,
      role: "user",
      content: userContent,
      cited_record_ids: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await sendChatMessage(activeSessionId, userContent);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { ...tempUserMsg, id: response.message.id - 1 },
        response.message,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transmit message");
    } finally {
      setIsSending(false);
    }
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100dvh-4.75rem)] sm:h-[calc(100vh-6.5rem)] max-w-6xl mx-auto my-0 sm:my-3 rounded-none sm:rounded-2xl border-0 sm:border border-[#e2dcd0]/80 glass-panel shadow-sm overflow-hidden relative">
      {/* Clinical Disclaimer Dialog */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/25 backdrop-blur-xs">
          <div className="max-w-md w-full p-5 sm:p-6 rounded-2xl glass-panel shadow-2xl animate-scale-in">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-amber-50/90 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs">
              <IconWarning size={20} />
            </div>
            <h2 className="text-base font-bold text-center text-slate-900 mb-1.5">
              Clinical Consultation Advisory
            </h2>
            <p className="text-xs text-slate-600 text-center mb-4 leading-relaxed">
              This interactive clinical assistant evaluates symptoms grounded in your health profile.
              It does <strong>not</strong> substitute for medical diagnosis or prescription. Always verify recommendations with a licensed practitioner.
            </p>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="btn-3d-primary w-full py-2 rounded-lg text-xs font-semibold"
            >
              Acknowledge & Proceed
            </button>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-xs"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Consultation Sessions Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } sm:translate-x-0 fixed inset-y-0 left-0 sm:inset-auto sm:relative z-40 sm:z-auto w-64 max-w-[85vw] sm:w-60 shrink-0 border-r border-[#e2dcd0]/80 bg-[#fff8eb]/80 backdrop-blur-md flex flex-col h-full transition-transform duration-150`}
      >
        <div className="p-3 border-b border-[#e2dcd0]/80 flex items-center justify-between sm:block gap-2">
          <button
            onClick={handleNewSession}
            className="btn-3d-primary flex-1 sm:w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <IconPlus size={14} />
            New Consultation
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="sm:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60"
            aria-label="Close sidebar"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSession(s.id)}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                activeSessionId === s.id
                  ? "bg-white/90 border border-[#3a5ebb]/35 text-[#2a4693] font-semibold shadow-xs"
                  : "text-slate-600 hover:bg-white/50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <IconConsultation size={14} className={activeSessionId === s.id ? "text-[#3a5ebb]" : "text-slate-400"} />
                <span className="truncate">
                  Session {new Date(s.started_at.replace(' ', 'T')).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-[11px] text-slate-400 text-center py-6 px-3">
              No previous consultations recorded.
            </p>
          )}
        </div>
      </div>

      {/* Main Dialogue Console */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#fff8eb]/40 backdrop-blur-xs">
        {/* Top Consultation Context Bar */}
        <div className="h-12 px-3.5 sm:px-5 border-b border-[#e2dcd0]/80 flex items-center justify-between shrink-0 bg-white/50 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="sm:hidden p-1.5 -ml-1 rounded-lg text-slate-600 hover:bg-white/60"
              aria-label="Open sessions list"
            >
              <IconMenu size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                {activeSession
                  ? `Consultation Transcript (${new Date(activeSession.started_at.replace(' ', 'T')).toLocaleDateString()})`
                  : "Clinical Health Assistant"}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <IconLockShield size={13} className="text-emerald-600" />
            <span className="hidden sm:inline">Grounded in Patient Vault</span>
          </div>
        </div>

        {!activeSessionId ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center px-4 max-w-sm">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl glass-chip flex items-center justify-center text-[#3a5ebb] shadow-xs">
                <IconConsultation size={24} />
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-1.5">
                Clinical Health Consultation
              </h2>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Consult with the clinical assistant for differential evaluation, medication inquiries, or symptom management.
              </p>
              <button
                onClick={handleNewSession}
                className="btn-3d-primary w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Begin Consultation
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Dialogue Message Feed */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 sm:space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                      msg.role === "user"
                        ? "bg-[#3a5ebb] text-white font-normal shadow-[0_2px_8px_rgba(58,94,187,0.3)]"
                        : "glass-panel text-slate-800"
                    }`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-70">
                      {msg.role === "user" ? "Patient" : "Clinical Assistant"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-500 flex items-center gap-1.5">
                    <svg className="animate-spin w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Evaluating clinical context...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error Message */}
            {error && (
              <div className="mx-3 mb-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <IconWarning size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Message Input Bar */}
            <form onSubmit={handleSend} className="p-2.5 sm:p-3 border-t border-[#e2dcd0]/80 bg-[#fff8eb]/90 backdrop-blur-md">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder="Inquire about symptoms, drug interactions, or next steps..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300/80 bg-white/90 backdrop-blur-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#3a5ebb] focus:ring-2 focus:ring-[#3a5ebb]/15 text-xs resize-none min-h-[38px] max-h-[100px] shadow-2xs"
                  disabled={isSending}
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isSending}
                  className="btn-3d-primary w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  aria-label="Send message"
                >
                  <IconSend size={15} />
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-400 text-center">
                Press Enter to send · Shift+Enter for new line · Grounded in encrypted profile
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}
