# Command line
`./skill-atlas scan <GitHub URL | directory>`
`github.com/<owner>/<repo>/tree/<commit>`: the repository at that commit (or branch, or tag).
`github.com/<owner>`: every repository of the organization (or the user), grouped by repository.
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
## An organization
```
JetBrains · 202 skills in 34 of 693 repositories

JetBrains/koog · 2 skills
add-java-code-snippets-in-docs — …
  https://github.com/JetBrains/koog/blob/<commit>/…

JetBrains/MPS · 43 skills
…
```
- The organization, its skill count, how many repositories have skills, of how many (forks left out)
- Then each repository with skills, as above, sorted by `owner/name` ignoring case, a blank line before each
