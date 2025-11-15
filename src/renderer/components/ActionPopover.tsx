// src/renderer/components/ActionPopover.tsx
import React from 'react'

interface ActionPopoverProps {
  resultText?: string
}

export default function ActionPopover({ resultText }: ActionPopoverProps) {
  const isError = resultText?.startsWith('Error:')
  
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 16,
        background: 'var(--ink-0, #FEFEFE)',
        overflow: 'auto',
        borderRadius: 12,
        outline: '1px var(--ink-400, rgba(20, 20, 20, 0.12)) solid',
        outlineOffset: '-1px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
      }}
    >
      {resultText ? (
        isError ? (
          <p className="body text-red-600">{resultText}</p>
        ) : (
          <div className="body whitespace-pre-wrap">{resultText}</div>
        )
      ) : (
        <p className="body text-muted-foreground">No result yet.</p>
      )}
    </div>
  )
}

