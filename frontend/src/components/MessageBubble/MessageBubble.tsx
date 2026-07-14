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
        <img
          src="/github-avatar.png"
          alt=""
          className="mt-1 h-8 w-8 shrink-0 rounded-full object-cover"
        />
      )}
      {isUser ? (
        <div className="min-w-0 max-w-[86%] overflow-hidden break-words rounded-[18px] border border-[#eadfd2] bg-[#fff8f1] px-4 py-3 text-[15px] leading-relaxed text-[#242731] md:max-w-[70%]">
          {message.content}
        </div>
      ) : message.content ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words px-1 py-1 text-[15px] leading-7 text-[#242731] md:max-w-[88%]">
          <p className="mb-2 text-base font-semibold text-[#1f222a]">ReszVault</p>
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
                <strong className="font-semibold text-[#20232b]">
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
                    className="rounded bg-[#f6ede5] px-1.5 py-0.5 font-mono text-[12px] text-[#b8651f]"
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
            <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-[#e8791a] align-middle" />
          )}
        </div>
      ) : isStreaming ? (
        <div className="flex items-center gap-2 rounded-2xl px-1 py-4">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-[#e8791a]/60"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
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
    <div className="group relative my-3 overflow-hidden rounded-xl border border-[#dfe2e7] bg-white">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-[#f1f3f6] px-2 py-1 text-[10px] font-medium text-[#6e737d] opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-[#242731]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
