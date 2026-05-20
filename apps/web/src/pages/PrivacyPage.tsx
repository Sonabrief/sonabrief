import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import privacyContent from '../../../../docs/privacy.md?raw';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-800 mb-8 inline-flex items-center gap-1"
        >
          ← Indietro
        </button>
        <ReactMarkdown
          components={{
            h1: ({children}) => <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground">{children}</h1>,
            h2: ({children}) => <h2 className="text-xl font-semibold mt-6 mb-3 text-foreground">{children}</h2>,
            h3: ({children}) => <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground">{children}</h3>,
            p: ({children}) => <p className="mb-4 text-muted-foreground leading-relaxed">{children}</p>,
            hr: () => <hr className="my-6 border-border" />,
            ul: ({children}) => <ul className="list-disc pl-6 mb-4 text-muted-foreground space-y-1">{children}</ul>,
            ol: ({children}) => <ol className="list-decimal pl-6 mb-4 text-muted-foreground space-y-1">{children}</ol>,
            table: ({children}) => <div className="overflow-x-auto mb-4"><table className="w-full text-sm border-collapse">{children}</table></div>,
            th: ({children}) => <th className="border border-border px-3 py-2 text-left font-semibold bg-muted">{children}</th>,
            td: ({children}) => <td className="border border-border px-3 py-2 text-muted-foreground">{children}</td>,
          }}
        >
          {privacyContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
