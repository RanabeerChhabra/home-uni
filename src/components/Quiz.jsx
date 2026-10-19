import { useEffect, useRef, useState } from 'react'
import { buildQuiz, POINTS_PER_CORRECT } from '../utils/quiz.js'
import { Chip, PrimaryButton } from './ui.jsx'

export function QuizCard({ block, status, result, onOpen }) {
  const label =
    block.weekStart === block.weekEnd ? `Week ${block.weekStart}` : `Weeks ${block.weekStart}–${block.weekEnd}`
  const taken = Boolean(result)

  return (
    <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-brand-700">Checkpoint quiz</span>
            <Chip tone="brand">{label}</Chip>
            {taken && (
              <Chip tone="green">
                Best {result.best}/{result.total}
              </Chip>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {status.unlocked
              ? `${status.questionIds.length} question${status.questionIds.length === 1 ? '' : 's'} on what you've finished. Earn ${POINTS_PER_CORRECT} XP for each one you get right.`
              : `Finish ${Math.max(1, status.needed - status.finishedCount)} more resource${status.needed - status.finishedCount > 1 ? 's' : ''} from these weeks to unlock it (${status.finishedCount}/${status.totalItems} done).`}
          </p>
        </div>
        <button
          type="button"
          disabled={!status.unlocked}
          onClick={onOpen}
          className="rounded-xl border-2 border-brand-500 bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
        >
          {!status.unlocked ? 'Locked' : taken ? 'Retake' : 'Take quiz'}
        </button>
      </div>
    </div>
  )
}

export function QuizModal({ block, questionIds, bank, attempt, previousBest, onFinish, onClose }) {
  const [questions] = useState(() => buildQuiz(questionIds, bank, attempt))
  // The parent updates the stored best as soon as we finish; keep the score we started from.
  const [startingBest] = useState(previousBest)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [correct, setCorrect] = useState(0)
  const [finished, setFinished] = useState(false)
  const headingRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    headingRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = questions[index]
  const answered = picked !== null
  const isLast = index === questions.length - 1

  function choose(i) {
    if (answered) return
    setPicked(i)
    if (i === q.answerIndex) setCorrect((c) => c + 1)
  }

  function advance() {
    if (isLast) {
      setFinished(true)
      onFinish(correct, questions.length)
    } else {
      setIndex((n) => n + 1)
      setPicked(null)
    }
  }

  const earned = Math.max(0, correct - (startingBest ?? 0)) * POINTS_PER_CORRECT
  const label =
    block.weekStart === block.weekEnd ? `Week ${block.weekStart}` : `Weeks ${block.weekStart}–${block.weekEnd}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="quiz-title" ref={headingRef} tabIndex={-1} className="text-lg font-bold text-ink outline-none">
            Checkpoint quiz · {label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quiz"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {!finished ? (
          <>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="brand-gradient h-full rounded-full transition-all"
                style={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }}
              />
            </div>
            <p className="mt-4 text-xs font-medium text-slate-400">
              Question {index + 1} of {questions.length}
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug text-ink">{q.prompt}</p>

            <div className="mt-5 grid gap-2.5" role="group" aria-label="Answer choices">
              {q.options.map((opt, i) => {
                const isAnswer = i === q.answerIndex
                const isPicked = i === picked
                let style = 'border-slate-200 bg-white hover:border-brand-300'
                if (answered && isAnswer) style = 'border-emerald-500 bg-emerald-50'
                else if (answered && isPicked) style = 'border-rose-400 bg-rose-50'
                else if (answered) style = 'border-slate-100 bg-white text-slate-400'
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={answered}
                    onClick={() => choose(i)}
                    className={`rounded-xl border-2 px-4 py-3 text-left text-sm font-medium text-ink transition-colors disabled:cursor-default ${style}`}
                  >
                    {opt}
                    {answered && isAnswer && <span className="sr-only"> (correct answer)</span>}
                    {answered && isPicked && !isAnswer && <span className="sr-only"> (your answer, incorrect)</span>}
                  </button>
                )
              })}
            </div>

            {answered && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600" role="status">
                <span className={`font-bold ${picked === q.answerIndex ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {picked === q.answerIndex ? 'Correct. ' : 'Not quite. '}
                </span>
                {q.why}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <PrimaryButton onClick={advance} disabled={!answered}>
                {isLast ? 'See my score' : 'Next'}
              </PrimaryButton>
            </div>
          </>
        ) : (
          <div className="py-6 text-center">
            <p className="text-5xl font-extrabold brand-gradient-text">
              {correct}/{questions.length}
            </p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {correct === questions.length
                ? 'Perfect score.'
                : correct >= Math.ceil(questions.length * 0.6)
                  ? 'Nice work.'
                  : 'Worth another look.'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {earned > 0
                ? `+${earned} XP earned.`
                : startingBest != null
                  ? 'No new XP, but your best score stays.'
                  : 'Quiz complete.'}
              {correct < Math.ceil(questions.length * 0.6) &&
                ' Revisit the resources you missed, then retake it any time.'}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <PrimaryButton onClick={onClose}>Back to my plan</PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
