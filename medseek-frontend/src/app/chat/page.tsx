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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
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
      setError("Failed to create session");
    }
  }

  async function handleSelectSession(sessionId: number) {
    try {
      setActiveSessionId(sessionId);
      const result = await getChatSession(sessionId);
      setMessages(result.messages);
      setSidebarOpen(false);
    } catch {
      setError("Failed to load session");
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activeSessionId || isSending) return;

    const userContent = input.trim();
    setInput("");
    setIsSending(true);
    setError(null);

    // Optimistic: add user message immediately
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
      // Replace temp message and add AI response
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { ...tempUserMsg, id: response.message.id - 1 }, // real IDs from server
        response.message,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] sm:h-[calc(100vh-8rem)] max-w-6xl mx-auto my-0 sm:my-4 rounded-none sm:rounded-3xl border-0 sm:border border-slate-200/80 bg-white/70 backdrop-blur-xl shadow-none sm:shadow-lg overflow-hidden relative">
      {/* Disclaimer modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-2xl animate-scale-in">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-center text-slate-800 mb-2">
              AI Health Assistant Disclaimer
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 text-center mb-6 leading-relaxed">
              This is an AI assistant, <strong>not a doctor</strong>. The information
              provided is for general health awareness only and should not be used as
              a substitute for professional medical advice, diagnosis, or treatment.
              Always consult a qualified healthcare professional.
            </p>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm hover:shadow-md hover:shadow-blue-600/20 active:scale-[0.98] transition-all"
            >
              I understand
            </button>
          </div>
        </div>
      )}

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Session sidebar */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} sm:translate-x-0 fixed inset-y-0 left-0 sm:inset-auto sm:relative z-40 sm:z-auto w-72 max-w-[85vw] sm:w-64 shrink-0 border-r border-slate-200 bg-white sm:bg-slate-50/70 shadow-2xl sm:shadow-none flex flex-col h-full transition-transform duration-200`}>
        <div className="p-4 border-b border-slate-100 sm:border-0 flex items-center justify-between sm:block gap-2">
          <button
            onClick={handleNewSession}
            className="flex-1 sm:w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold hover:shadow-md hover:shadow-blue-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="sm:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSession(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                activeSessionId === s.id
                  ? "bg-blue-50 border border-blue-200/60 text-blue-700 font-semibold shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <span>💬</span>
                Chat {new Date(s.started_at.replace(' ', 'T')).toLocaleDateString()}
              </span>
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8 px-4">
              No chat sessions yet. Start a new chat to begin.
            </p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white/40">
        {/* Chat top header bar */}
        <div className="h-14 px-3 sm:px-6 border-b border-slate-200/80 bg-white/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="sm:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-slate-100"
              aria-label="Open sessions list"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-800 truncate">
                {activeSession ? `Chat ${new Date(activeSession.started_at.replace(' ', 'T')).toLocaleDateString()}` : "AI Health Chat"}
              </h2>
              <p className="text-[11px] text-slate-500 truncate hidden sm:block">
                Grounded in your private health profile
              </p>
            </div>
          </div>
          <button
            onClick={handleNewSession}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200/60 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>

        {!activeSessionId ? (
          <div className="flex-1 flex items-center justify-center p-4 animate-fade-in">
            <div className="text-center px-4 max-w-sm">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20 text-white animate-float">
                <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
                MedSeek AI Health Chat
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
                Get personalized health insights grounded in your medical profile.
                Start a new chat to begin.
              </p>
              <button
                onClick={handleNewSession}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-600/20 active:scale-[0.98] transition-all"
              >
                Start a Chat
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3 sm:space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${
                    msg.role === "user" ? "animate-slide-in-right" : "animate-slide-in-left"
                  }`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[75%] px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-xs shadow-xs shadow-blue-600/10"
                        : "bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs shadow-xs"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start animate-slide-in-left">
                  <div className="bg-white border border-slate-200/90 px-4 py-3 sm:px-5 sm:py-4 rounded-2xl rounded-bl-xs shadow-xs">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" style={{ animation: "dot-wave 1.4s ease-in-out infinite", animationDelay: "0s" }} />
                      <span className="w-2 h-2 rounded-full bg-blue-500" style={{ animation: "dot-wave 1.4s ease-in-out infinite", animationDelay: "0.2s" }} />
                      <span className="w-2 h-2 rounded-full bg-blue-500" style={{ animation: "dot-wave 1.4s ease-in-out infinite", animationDelay: "0.4s" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error */}
            {error && (
              <div className="mx-3 sm:mx-4 mb-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm animate-shake">
                {error}
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-slate-200 bg-white/80">
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
                  placeholder="Describe your symptoms or ask a question..."
                  className="flex-1 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-base sm:text-sm resize-none min-h-[44px] max-h-[120px]"
                  disabled={isSending}
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isSending}
                  className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center hover:shadow-md hover:shadow-blue-600/20 active:scale-[0.95] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  aria-label="Send message"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-400 text-center">
                Press Enter to send · Shift+Enter for new line
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
