import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt }) =>
            typeof src === "string" &&
            /^(https?:)?\/\//i.test(
              src
                .replace(/[\t\n\r]/g, "")
                .trim()
                .replace(/\\/g, "/"),
            ) ? null : (
              <img src={src} alt={alt ?? ""} />
            ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
