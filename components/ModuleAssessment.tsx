'use client';

import { useState } from 'react';

type AssessmentQuestion = { id: string; prompt: string; options: string[]; position: number };

export function ModuleAssessment({
  assessmentId,
  title,
  passPercentage,
  questions,
}: {
  assessmentId: string;
  title: string;
  passPercentage: number;
  questions: AssessmentQuestion[];
}) {
  const [answers, setAnswers] = useState<Array<number | null>>(questions.map(() => null));
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitAssessment() {
    setError('');
    setResult(null);
    if (answers.some((answer) => answer === null)) {
      setError('Responda todas as questões antes de enviar.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Não foi possível corrigir a avaliação.');
        return;
      }
      setResult({ score: data.score, passed: data.passed });
    } catch {
      setError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="module-assessment-card">
      <div className="eyebrow">Verificação de aprendizagem</div>
      <div className="module-assessment-heading">
        <h4>{title}</h4>
        <span>Nota mínima: {passPercentage}%</span>
      </div>
      {questions.map((question, questionIndex) => (
        <fieldset className="module-assessment-question" key={question.id}>
          <legend>{questionIndex + 1}. {question.prompt}</legend>
          <div className="module-assessment-options">
            {question.options.map((option, optionIndex) => (
              <label key={`${question.id}-${optionIndex}`}>
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  value={optionIndex}
                  checked={answers[questionIndex] === optionIndex}
                  onChange={() => setAnswers((current) => current.map((answer, index) => index === questionIndex ? optionIndex : answer))}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p className="course-review-message error" role="alert">{error}</p>}
      {result && (
        <p className={`assessment-result${result.passed ? ' passed' : ''}`} role="status">
          {result.passed ? 'Aprovado' : 'Continue estudando'} · {result.score}%
        </p>
      )}
      <button className="button small" type="button" onClick={submitAssessment} disabled={submitting} aria-busy={submitting}>
        {submitting ? 'Corrigindo…' : 'Enviar respostas'}
      </button>
    </section>
  );
}