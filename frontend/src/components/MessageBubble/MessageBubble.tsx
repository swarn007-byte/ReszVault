import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import type { Message } from "../../store/chatStore";

type Props = { message: Message; isStreaming?: boolean };

export function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={isStreaming ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isStreaming ? 0 : 0.2 }}
      className={`flex w-full gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c87c5a] text-[10px] font-bold uppercase text-[#181818] shadow-sm">
          RV
        </div>
      )}
      {isUser ? (
        <div className="max-w-[86%] rounded-2xl rounded-tr-sm bg-[#c87c5a] px-4 py-3 text-sm leading-relaxed text-[#181818] shadow-sm md:max-w-[76%]">
          {message.content}
        </div>
      ) : message.content ? (
        <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-white/[0.08] bg-[#202020] px-5 py-4 text-sm leading-relaxed text-[#e8e6e1] shadow-sm md:max-w-[84%]">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8f8b84]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#75d083]" />
            ReszVault answer
          </div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="mb-3 list-disc pl-5">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 list-decimal pl-5">{children}</ol>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-[#e8e6e1]">
                  {children}
                </strong>
              ),
              code: ({ className, children, ...props }) => {
                const isBlock = className?.includes("language-");
                if (isBlock)
                  return (
                    <CodeBlock code={String(children).replace(/\n$/, "")} />
                  );
                return (
                  <code
                    className="rounded bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[12px] text-[#c87c5a]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => <>{children}</>,
            }}
          >
            {message.content}
          </ReactMarkdown>
          {isStreaming && (
            <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-[#c87c5a] align-middle" />
          )}
        </div>
      ) : isStreaming ? (
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#202020] px-5 py-4 shadow-sm">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-[#c87c5a]/60"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
          <span className="text-xs text-[#7a7875]">Thinking...</span>
        </div>
      ) : null}
    </motion.div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-[rgba(255, 255, 255, 0.08)] bg-[#2a2a2a]">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-[#222222]/80 px-2 py-1 text-[10px] font-medium text-[#7a7875] opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-[#e8e6e1]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
