/**
 * examples/sparc-graph.ts — run the SPARC development methodology as a graph.
 *
 * Run:  npx tsx examples/sparc-graph.ts
 * Needs a provider key (default: DEEPSEEK_API_KEY).
 */
import { runSparc } from '../src/index.ts'

const { state, steps } = await runSparc(
  {
    model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
    maxSteps: 6,
    // Multi-agent fan-out during Refinement (parallel implementation):
    // workers: [
    //   { name: 'core', instructions: 'Implement the core logic + unit tests.' },
    //   { name: 'cli', instructions: 'Implement the CLI wrapper.' },
    // ],
  },
  'Write a TypeScript function isPalindrome(s: string): boolean with unit tests',
)

console.log('graph steps:', steps)
console.log('\n===== SPECIFICATION =====\n' + (state.spec ?? ''))
console.log('\n===== PSEUDOCODE =====\n' + (state.pseudocode ?? ''))
console.log('\n===== ARCHITECTURE =====\n' + (state.architecture ?? ''))
console.log('\n===== IMPLEMENTATION =====\n' + (state.implementation ?? ''))
console.log('\n===== REVIEW (approved=' + state.approved + ') =====\n' + (state.review ?? ''))
