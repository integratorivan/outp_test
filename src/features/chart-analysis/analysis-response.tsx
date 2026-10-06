import { Check, ChevronDown, Copy, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import Markdown from 'react-markdown'

import { Avatar, AvatarFallback, AvatarGroup } from '../../shared/ui/avatar'
import { Button } from '../../shared/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../shared/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../shared/ui/tooltip'
import type { AnalysisDraft } from './model'
import { analysisText, sourceDomain } from './response-text'

function SourceAvatar({ domain }: { domain: string }) {
  return (
    <Avatar size="sm" render={<span />}>
      <AvatarFallback>{domain[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

function SourceChip({ source }: { source: AnalysisDraft['sources'][number] }) {
  const domain = sourceDomain(source.url)
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Источник: ${source.title}`}
      title={source.title}
      className="analysis-source-chip mx-1 inline-flex max-w-full translate-y-[-1px] items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 align-middle font-mono text-[11px] text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
    >
      <span aria-hidden="true" className="font-sans font-medium">
        {domain[0]?.toUpperCase()}
      </span>
      <span className="truncate">{domain}</span>
    </a>
  )
}

export function AnalysisResponse({
  response,
  complete,
  streaming,
  animate,
  canRetry,
  onRetry,
}: {
  response: AnalysisDraft
  complete: boolean
  streaming: boolean
  animate: boolean
  canRetry: boolean
  onRetry: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(response.answer)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <section aria-label="Ответ Sonar" aria-busy={streaming} className="flex min-w-0 flex-col gap-3">
      <div
        data-streaming={streaming}
        className="analysis-response-text flex min-w-0 flex-col gap-3 break-words text-[15px] leading-6 text-muted-foreground [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_h1]:font-medium [&_h1]:text-foreground [&_h2]:font-medium [&_h2]:text-foreground [&_h3]:font-medium [&_h3]:text-foreground"
      >
        <Markdown
          skipHtml
          rehypePlugins={[[analysisText, { sources: response.sources, animate }]]}
          components={{
            a: ({ href, children, node }) => {
              const source = response.sources.find((source) => source.url === href)
              return source && node?.properties.dataAnalysisCitation ? (
                <SourceChip source={source} />
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  {children}
                </a>
              )
            },
            img: () => null,
          }}
        >
          {response.answer}
        </Markdown>
      </div>
      {complete && (
        <>
          <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen} className="flex min-w-0 flex-col gap-2">
            <div className="analysis-response-actions flex flex-wrap items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={copyAnswer}
                      aria-label={copied ? 'Ответ скопирован' : 'Скопировать ответ'}
                    />
                  }
                >
                  {copied ? <Check /> : <Copy />}
                </TooltipTrigger>
                <TooltipContent>{copied ? 'Скопировано' : 'Копировать'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onRetry}
                      disabled={!canRetry}
                      aria-label="Повторить запрос (платно)"
                    />
                  }
                >
                  <RotateCcw />
                </TooltipTrigger>
                <TooltipContent>Повторить · платный запрос</TooltipContent>
              </Tooltip>
              {response.sources.length > 0 && (
                <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="ml-2" />}>
                  <AvatarGroup aria-hidden="true">
                    {response.sources.slice(0, 3).map((source) => (
                      <SourceAvatar key={source.url} domain={sourceDomain(source.url)} />
                    ))}
                  </AvatarGroup>
                  Источники · {response.sources.length}
                  <ChevronDown data-icon="inline-end" />
                </CollapsibleTrigger>
              )}
            </div>
            <CollapsibleContent className="analysis-sources-panel">
              <ol className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted p-1">
                {response.sources.map((source, index) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent"
                    >
                      <SourceAvatar domain={sourceDomain(source.url)} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="break-words text-xs">{source.title}</span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {sourceDomain(source.url)}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{index + 1}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
          {copied && (
            <span role="status" className="sr-only">
              Ответ скопирован
            </span>
          )}
          {copyError && (
            <p role="status" className="text-xs text-destructive">
              Не удалось скопировать ответ.
            </p>
          )}
        </>
      )}
    </section>
  )
}
