'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type AssessmentQuestion = { prompt: string; options: string[]; correct_option: number };
type AssessmentData = { title: string; pass_percentage: number; published: boolean; questions: AssessmentQuestion[] };

const newQuestion = (): AssessmentQuestion => ({ prompt: '', options: ['', ''], correct_option: 0 });

export function AssessmentManager({ moduleId }: { moduleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentData>({
    title: 'Avaliação do módulo',
    pass_percentage: 70,
    published: false,
    questions: [newQuestion()],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function toggleEditor() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen || loaded) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/modules/${moduleId}/assessment`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? 'Não foi possível carregar a avaliação.');
        return;
      }
      if (result.assessment) {
        setAssessment({
          title: result.assessment.title,
          pass_percentage: result.assessment.pass_percentage,
          published: result.assessment.published,
          questions: result.assessment.questions.map((question: AssessmentQuestion) => ({
            prompt: question.prompt,
            options: question.options,
            correct_option: question.correct_option,
          })),
        });
      }
      setLoaded(true);
    } catch {
      setError('Não foi possível conectar ao servidor.');
    } finally {
      setBusy(false);
    }
  }

  function updateQuestion(questionIndex: number, update: Partial<AssessmentQuestion>) {
    setAssessment((current) => ({
      ...current,
      questions: current.questions.map((question, index) => index === questionIndex ? { ...question, ...update } : question),
    }));
  }

  async function saveAssessment() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/modules/${moduleId}/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assessment),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? 'Não foi possível salvar a avaliação.');
        return;
      }
      setLoaded(true);
      setNotice(assessment.published ? 'Avaliação publicada para alunos matriculados.' : 'Rascunho da avaliação salvo.');
      router.refresh();
    } catch {
      setError('Não foi possível conectar ao servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="module-assessment-editor">
      <button className="button small secondary" type="button" onClick={toggleEditor} aria-expanded={open}>
        {open ? 'Fechar avaliação' : 'Avaliação do módulo'}
      </button>
      {open && (
        <div className="assessment-editor-body">
          {error && <p className="course-manager-error" role="alert">{error}</p>}
          {notice && <p className="course-assessment-notice" role="status">{notice}</p>}
          <div className="field-row">
            <div className="field">
              <label htmlFor={`assessment-title-${moduleId}`}>Título</label>
              <input id={`assessment-title-${moduleId}`} value={assessment.title} maxLength={150} onChange={(event) => setAssessment((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor={`assessment-pass-${moduleId}`}>Nota mínima (%)</label>
              <input id={`assessment-pass-${moduleId}`} type="number" min={50} max={100} value={assessment.pass_percentage} onChange={(event) => setAssessment((current) => ({ ...current, pass_percentage: Number(event.target.value) }))} />
            </div>
          </div>
          {assessment.questions.map((question, questionIndex) => (
            <fieldset className="assessment-question-editor" key={questionIndex}>
              <legend>Questão {questionIndex + 1}</legend>
              <div className="field">
                <label htmlFor={`assessment-question-${moduleId}-${questionIndex}`}>Enunciado</label>
                <input id={`assessment-question-${moduleId}-${questionIndex}`} value={question.prompt} maxLength={500} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} />
              </div>
              {question.options.map((option, optionIndex) => (
                <div className="assessment-option-row" key={optionIndex}>
                  <label className="assessment-option-correct">
                    <input type="radio" name={`assessment-correct-${moduleId}-${questionIndex}`} checked={question.correct_option === optionIndex} onChange={() => updateQuestion(questionIndex, { correct_option: optionIndex })} aria-label={`Alternativa ${optionIndex + 1} é a correta`} />
                    Correta
                  </label>
                  <input value={option} maxLength={180} aria-label={`Alternativa ${optionIndex + 1} da questão ${questionIndex + 1}`} onChange={(event) => updateQuestion(questionIndex, { options: question.options.map((value, index) => index === optionIndex ? event.target.value : value) })} />
                  {question.options.length > 2 && <button type="button" className="button small secondary" onClick={() => updateQuestion(questionIndex, { options: question.options.filter((_, index) => index !== optionIndex), correct_option: question.correct_option === optionIndex ? 0 : question.correct_option > optionIndex ? question.correct_option - 1 : question.correct_option })} aria-label={`Remover alternativa ${optionIndex + 1}`}>Remover</button>}
                </div>
              ))}
              {question.options.length < 6 && <button type="button" className="assessment-add-option" onClick={() => updateQuestion(questionIndex, { options: [...question.options, ''] })}>+ Alternativa</button>}
              {assessment.questions.length > 1 && <button type="button" className="assessment-remove-question" onClick={() => setAssessment((current) => ({ ...current, questions: current.questions.filter((_, index) => index !== questionIndex) }))}>Remover questão</button>}
            </fieldset>
          ))}
          {assessment.questions.length < 30 && <button type="button" className="button small secondary" onClick={() => setAssessment((current) => ({ ...current, questions: [...current.questions, newQuestion()] }))}>+ Adicionar questão</button>}
          <label className="assessment-publish-toggle">
            <input type="checkbox" checked={assessment.published} onChange={(event) => setAssessment((current) => ({ ...current, published: event.target.checked }))} />
            Publicar para alunos matriculados
          </label>
          <button type="button" className="button" onClick={saveAssessment} disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : 'Salvar avaliação'}</button>
        </div>
      )}
    </section>
  );
}