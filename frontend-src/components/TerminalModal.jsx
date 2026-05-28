import React, { useState, useEffect, useRef } from 'react'
import { BASE_URL } from '../services/api.js'
import './TerminalModal.css'

export default function TerminalModal({ asmCode, onClose }) {
  const [output, setOutput] = useState([])
  const [inputVal, setInputVal] = useState('')
  const [status, setStatus] = useState('connecting') // connecting, nasm, gcc, running, finished, error
  const [exitCode, setExitCode] = useState(null)
  const wsRef = useRef(null)
  const outputRef = useRef(null)
  const inputRef = useRef(null)

  const finishedRef = useRef(false)

  useEffect(() => {
    if (!asmCode) return
    finishedRef.current = false

    // Convertir BASE_URL (http/https) a ws/wss
    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/ws/run'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('nasm')
      ws.send(JSON.stringify({ asm_code: asmCode }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'info') {
          const text = msg.text || ''
          if (text.includes('NASM'))      setStatus('nasm')
          else if (text.includes('GCC'))  setStatus('gcc')
          else if (text.includes('Ejec')) setStatus('running')
          setOutput(prev => [...prev, { type: 'info', text: msg.text }])
        } else if (msg.type === 'clear') {
          setOutput(prev => prev.filter(l => l.type !== 'info'))
          setStatus('running')
          if (inputRef.current) inputRef.current.focus()
        } else if (msg.type === 'err') {
          if (!finishedRef.current) {
            setOutput(prev => [...prev, { type: 'err', text: msg.text }])
            setStatus('error')
          }
        } else if (msg.type === 'stdout') {
          setOutput(prev => {
            const text = msg.text
            if (prev.length > 0 && prev[prev.length - 1].type === 'stdout' && 
                prev[prev.length - 1].text === text) {
              return prev
            }
            if (prev.length > 0 && prev[prev.length - 1].type === 'stdout') {
              const newPrev = [...prev]
              newPrev[newPrev.length - 1] = {
                type: 'stdout',
                text: newPrev[newPrev.length - 1].text + text
              }
              return newPrev
            }
            return [...prev, { type: 'stdout', text: msg.text }]
          })
        } else if (msg.type === 'exit') {
          if (!finishedRef.current) {
            finishedRef.current = true
            const code = msg.code
            setExitCode(code)
            setOutput(prev => [...prev, { type: 'exit', text: `Proceso terminado con código ${code}`, code }])
            setStatus('finished')
          }
        }
      } catch (e) {
        // Ignorar mensajes no-JSON (ej: close frames)
      }
    }

    ws.onerror = () => {
      if (!finishedRef.current) {
        setOutput(prev => [...prev, { type: 'err', text: 'Error de conexión WebSocket' }])
        setStatus('error')
      }
    }

    ws.onclose = () => {
      // No hacer nada extra si ya terminó
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [asmCode])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && status === 'running') {
      const txt = inputVal
      setOutput(prev => [...prev, { type: 'stdin', text: txt + '\n' }])
      wsRef.current.send(JSON.stringify({ type: 'stdin', text: txt }))
      setInputVal('')
    }
  }

  const focusInput = () => {
    if (status === 'running' && inputRef.current) {
      inputRef.current.focus()
    }
  }

  const pipelineDone = (stage) => {
    const order = ['nasm', 'gcc', 'running', 'finished']
    const current = order.indexOf(status)
    const target = order.indexOf(stage)
    if (status === 'error') return false
    return current > target
  }

  const pipelineActive = (stage) => status === stage

  return (
    <div className="terminal-modal-overlay">
      <div className="terminal-modal-container" onClick={focusInput}>
        {/* ── Header ── */}
        <div className="terminal-modal-header">
          <span className={`terminal-modal-title ${status === 'finished' ? 'finished' : ''}`}>
            CONSOLA INTERACTIVA
          </span>
          <button className="terminal-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Output body ── */}
        <div className="terminal-modal-body" ref={outputRef}>
          {output.map((line, i) => {
            if (line.type === 'stdout') {
              return <span key={i} className="term-stdout">{line.text}</span>
            }
            if (line.type === 'stdin') {
              return <span key={i} className="term-stdin">{line.text}</span>
            }
            if (line.type === 'info') {
              return <div key={i} className="term-info">{line.text}</div>
            }
            if (line.type === 'err') {
              return <div key={i} className="term-err">{line.text}</div>
            }
            if (line.type === 'exit') {
              return (
                <div key={i} className={`term-exit ${line.code === 0 ? 'success' : 'error'}`}>
                  {line.text}
                </div>
              )
            }
            return null
          })}
          {status === 'running' && (
            <span className="term-input-line">
              <input 
                ref={inputRef}
                type="text" 
                className="term-input" 
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe aquí..."
                autoFocus
                autoComplete="off"
              />
            </span>
          )}
        </div>

        {/* ── Footer pipeline ── */}
        <div className="terminal-modal-footer">
          <div className={`pipeline-step ${pipelineActive('nasm') ? 'active' : ''} ${pipelineDone('nasm') ? 'done' : ''}`}>
            <span className="step-dot" />NASM
          </div>
          <span className="pipeline-arrow">→</span>
          <div className={`pipeline-step ${pipelineActive('gcc') ? 'active' : ''} ${pipelineDone('gcc') ? 'done' : ''}`}>
            <span className="step-dot" />GCC
          </div>
          <span className="pipeline-arrow">→</span>
          <div className={`pipeline-step ${pipelineActive('running') ? 'active' : ''} ${pipelineDone('running') ? 'done' : ''}`}>
            <span className="step-dot" />EJECUTAR
          </div>
        </div>
      </div>
    </div>
  )
}
