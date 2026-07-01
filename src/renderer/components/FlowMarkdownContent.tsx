import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  className?: string;
};

export function FlowMarkdownContent({ content, className = "" }: Props) {
  return (
    <div
      className={`flow-markdown text-[14px] leading-relaxed text-[var(--ink)] ${className}`}
      data-surface="warm"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-5 text-[18px] font-semibold text-[var(--ink)] first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-[16px] font-semibold text-[var(--ink)] first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-[15px] font-medium text-[var(--ink)] first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-[var(--clay)]/50 pl-4 text-[var(--muted)] last:mb-0">
              {children}
            </blockquote>
          ),
          code: ({ className: codeClass, children }) => {
            const isBlock = codeClass?.includes("language-");
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-[12px] bg-[var(--sand-deep)]/60 px-3 py-2 font-mono text-[12px]">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded-[6px] bg-[var(--sand-deep)]/70 px-1.5 py-0.5 font-mono text-[12px]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-[16px] border border-[var(--sand)] bg-[var(--cream)] p-4 last:mb-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full min-w-[280px] border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[var(--sand)]/80">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-[var(--sand)] px-3 py-2 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border border-[var(--sand)] px-3 py-2">{children}</td>,
          hr: () => <hr className="my-4 border-[var(--sand)]" />,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-[var(--clay-deep)] underline decoration-[var(--clay)]/40 underline-offset-2 hover:text-[var(--clay)]"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
