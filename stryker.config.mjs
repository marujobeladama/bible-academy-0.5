export default {
  mutate: ['lib/progress.ts'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.mts',
  },
  reporters: ['clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  // ATENÇÃO: @stryker-mutator/vitest-runner@10.0.0 é incompatível com
  // vitest@5.x — todos os mutantes aparecem como "survived" mesmo quando
  // os testes os matam de verdade (bug upstream, ainda sem correção):
  // https://github.com/stryker-mutator/stryker-js/issues/6210
  // Por isso "break: 50" abaixo vai fazer `npm run test:mutation` falhar
  // (exit code != 0) ATÉ essa incompatibilidade ser corrigida — isso é
  // intencional: é melhor falhar visivelmente do que reportar silenciosamente
  // um score de 0.00 como se fosse sucesso. Quando a vitest-runner lançar uma
  // versão compatível com vitest 5, revisar este threshold para um valor real
  // baseado no mutation score genuíno do projeto.
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
};