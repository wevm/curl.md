import type { TestProject } from 'vitest/node'
import { Env } from './env.ts'

export default function (project: TestProject) {
  project.provide('env', JSON.stringify(Env.get()))
}
