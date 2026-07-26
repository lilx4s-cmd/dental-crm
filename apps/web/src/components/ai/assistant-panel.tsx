'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Send, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { isAiNotConfiguredError } from '@/hooks/use-ai';

// The questions this can actually answer, offered up front. An empty box invites questions about
// things it cannot see, and being told "I can't see that" three times running teaches people the
// feature is useless.
const EXAMPLES = [
  'Who should I call first today?',
  'What went cold that I should try again?',
  'Where are most of my deals stuck?',
];

interface Turn {
  question: string;
  answer: string;
}

export function AssistantPanel() {
  const { accessToken } = useAuth();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);

  const ask = useMutation({
    mutationFn: (q: string) =>
      apiRequest<{ answer: string }>(
        '/api/ai/assistant',
        { method: 'POST', body: JSON.stringify({ question: q }) },
        accessToken ?? undefined,
      ),
  });

  const send = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || ask.isPending) return;
    setQuestion('');
    ask.mutate(trimmed, {
      onSuccess: ({ answer }) => setTurns((t) => [...t, { question: trimmed, answer }]),
    });
  };

  const notConfigured = ask.isError && isAiNotConfiguredError(ask.error);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Ask about your pipeline
        </CardTitle>
        <CardDescription>
          Answers come only from the deals you can already see. It has no access to medical records.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {turns.map((turn, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-sm font-medium">{turn.question}</p>
            <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">{turn.answer}</p>
          </div>
        ))}

        {turns.length === 0 && !ask.isPending && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => send(e)}
                className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {ask.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </p>
        )}

        {ask.isError && (
          <p className="rounded-md border border-destructive/25 bg-destructive-muted px-3 py-2 text-sm text-destructive-muted-foreground">
            {notConfigured
              ? 'AI is not configured for this clinic yet — add XAI_API_KEY in Render to switch this on.'
              : ask.error instanceof Error
                ? ask.error.message
                : 'Something went wrong.'}
          </p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
        >
          <Input
            placeholder="Ask a question…"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" size="icon" disabled={!question.trim() || ask.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
