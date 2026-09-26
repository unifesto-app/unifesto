"use client";

import { useState, useRef, useEffect } from "react";
import { brandGradient } from "@/lib/styles";

type Message = {
  id: string;
  sender: "user" | "support";
  message: string;
  timestamp: string;
};

export default function FloatingSupport() {
  const [isOpen, setIsOpen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "support",
      message: "Hi! Welcome to Unifesto Support. How can we help you today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (showChat && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [showChat]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      message: newMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, userMessage]);
    setNewMessage("");
    setIsTyping(true);

    // Simulate support response
    setTimeout(() => {
      const responses = [
        "Thanks for reaching out! Let me help you with that.",
        "I understand your concern. Let me check that for you.",
        "Great question! Here's what I can tell you...",
        "I'm here to help! Could you provide more details?",
        "Let me look into that right away.",
      ];
      
      const supportMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "support",
        message: responses[Math.floor(Math.random() * responses.length)],
        timestamp: new Date().toISOString(),
      };
      
      setMessages((prev) => [...prev, supportMessage]);
      setIsTyping(false);
    }, 2000);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const handleOpenChat = () => {
    setShowChat(true);
    setIsOpen(false);
  };

  const handleCloseChat = () => {
    setShowChat(false);
  };

  const supportOptions = [
    {
      label: "Support Center",
      href: "/support",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      description: "Browse FAQs & create tickets",
      onClick: () => setIsOpen(false),
    },
    {
      label: "Email Us",
      href: "mailto:support@unifesto.app",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      description: "support@unifesto.app",
      onClick: () => setIsOpen(false),
    },
    {
      label: "Live Chat",
      href: "#",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      description: "Chat with support team",
      onClick: handleOpenChat,
    },
  ];

  return (
    <>
      {/* Chat Window */}
      {showChat && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] z-50 flex flex-col rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-fade-in-up">
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10" style={{ background: brandGradient }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-black">Unifesto Support</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
                  <p className="text-xs text-black/80">Online</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleCloseChat}
              className="w-8 h-8 rounded-lg hover:bg-black/10 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex gap-2 max-w-[80%] ${msg.sender === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      msg.sender === "support" ? "text-black" : "bg-white/10 text-white"
                    }`}
                    style={msg.sender === "support" ? { background: brandGradient } : {}}
                  >
                    {msg.sender === "support" ? "S" : "Y"}
                  </div>
                  
                  {/* Message Bubble */}
                  <div>
                    <div
                      className={`rounded-2xl px-4 py-2.5 ${
                        msg.sender === "user"
                          ? "bg-white/10 text-white"
                          : "bg-white/5 text-white border border-white/10"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                    </div>
                    <p className={`text-[10px] text-slate-600 mt-1 ${msg.sender === "user" ? "text-right" : "text-left"}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex gap-2 max-w-[80%]">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-black"
                    style={{ background: brandGradient }}
                  >
                    S
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10 bg-white/[0.02]">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none hover:border-white/20 focus:border-[#3491ff] transition-colors duration-200"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="w-10 h-10 rounded-full flex items-center justify-center text-black transition-all duration-300 hover:shadow-[0_0_20px_rgba(52,145,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                style={{ background: brandGradient }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
            <p className="text-[10px] text-slate-600 text-center mt-2">
              Typically replies in a few minutes
            </p>
          </div>
        </div>
      )}

      {/* Floating Button */}
      {!showChat && (
        <div className="fixed bottom-6 right-6 z-50">
          {/* Support Options Menu */}
          {isOpen && (
            <div className="absolute bottom-20 right-0 w-72 mb-2 animate-fade-in-up">
              <div className="rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
                {/* Gradient top border */}
                <div className="h-px w-full" style={{ background: brandGradient }} />
                
                {/* Header */}
                <div className="p-4 border-b border-white/5">
                  <h3 className="text-sm font-bold text-white mb-1">Need Help?</h3>
                  <p className="text-xs text-slate-500">Choose how you'd like to reach us</p>
                </div>

                {/* Options */}
                <div className="p-2">
                  {supportOptions.map((option) => (
                    <a
                      key={option.label}
                      href={option.href}
                      onClick={(e) => {
                        if (option.href === "#") {
                          e.preventDefault();
                        }
                        option.onClick();
                      }}
                      className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-all duration-200 group cursor-pointer"
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-black"
                        style={{ background: brandGradient }}
                      >
                        {option.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-[#3491ff] group-hover:to-[#0062ff] transition-all">
                          {option.label}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{option.description}</p>
                      </div>
                      <svg
                        className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors flex-shrink-0 mt-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  ))}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-white/5 bg-white/[0.02]">
                  <p className="text-[10px] text-slate-600 text-center">
                    Available 24/7 • Response within 24 hours
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Main Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="group relative w-14 h-14 rounded-full flex items-center justify-center text-black transition-all duration-300 hover:shadow-[0_0_40px_rgba(52,145,255,0.6)] hover:scale-110"
            style={{ background: brandGradient }}
            aria-label="Contact Support"
          >
            {/* Pulse Animation - Only on Hover */}
            <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-20 group-hover:animate-ping" style={{ background: brandGradient }} />
            
            {/* Icon */}
            <svg
              className={`w-6 h-6 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              )}
            </svg>
          </button>

          {/* Tooltip on hover (when menu is closed) */}
          {!isOpen && (
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <div className="bg-black/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-2 rounded-lg whitespace-nowrap border border-white/10">
                Need help? Contact us
                <div className="absolute top-full right-6 -mt-1 w-2 h-2 bg-black/90 border-r border-b border-white/10 transform rotate-45" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overlay (when menu is open) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Add animation styles */}
      <style jsx>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
