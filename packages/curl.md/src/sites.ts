import { githubBlob, githubIssue, githubPr } from './rules/github.ts'

export function github(options: { token?: string | undefined } = {}) {
  return {
    [githubBlob.key]: githubBlob(),
    [githubIssue.key]: githubIssue({ token: options.token }),
    [githubPr.key]: githubPr({ token: options.token }),
  }
}
