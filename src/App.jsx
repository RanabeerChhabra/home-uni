import { useEffect, useMemo, useState } from 'react'
import Survey from './components/Survey.jsx'
import Calendar from './components/Calendar.jsx'
import ComingSoon from './components/ComingSoon.jsx'
import { TOPICS, getCurriculum } from './data/curriculum.js'
import { buildSchedule } from './utils/schedule.js'
import { loadState, saveState, clearState } from './utils/storage.js'
import { recordActivity, initialStreak, POINTS_PER_ITEM } from './utils/streak.js'

const saved = loadState()

export default function App() {
  const [answers, setAnswers] = useState(saved?.answers ?? null)
  const [doneItems, setDoneItems] = useState(new Set(saved?.doneItems ?? []))
  const [streak, setStreak] = useState(saved?.streak ?? initialStreak())

  const topicMeta = answers ? TOPICS.find((t) => t.id === answers.topic) : null
  const curriculumItems = answers ? getCurriculum(answers.topic, answers.level) : null

  const schedule = useMemo(() => {
    if (!curriculumItems) return null
    return buildSchedule(curriculumItems, answers.daysPerWeek)
  }, [curriculumItems, answers])

  useEffect(() => {
    if (!answers) {
      clearState()
      return
    }
    saveState({ answers, doneItems: [...doneItems], streak })
  }, [answers, doneItems, streak])

  function handleSurveyComplete(surveyAnswers) {
    setDoneItems(new Set())
    setStreak(initialStreak())
    setAnswers(surveyAnswers)
  }

  function handleToggleDone(itemId) {
    setDoneItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
        setStreak((prevStreak) => recordActivity(prevStreak))
      }
      return next
    })
  }

  function handleStartOver() {
    clearState()
    setAnswers(null)
    setDoneItems(new Set())
    setStreak(initialStreak())
  }

  if (!answers) {
    return <Survey onComplete={handleSurveyComplete} />
  }

  if (!curriculumItems) {
    return <ComingSoon topicLabel={topicMeta?.label ?? 'This topic'} onBack={handleStartOver} />
  }

  return (
    <Calendar
      schedule={schedule}
      doneItems={doneItems}
      onToggleDone={handleToggleDone}
      topicLabel={topicMeta.label}
      level={answers.level}
      totalItems={curriculumItems.length}
      points={doneItems.size * POINTS_PER_ITEM}
      streak={streak}
      onStartOver={handleStartOver}
    />
  )
}
