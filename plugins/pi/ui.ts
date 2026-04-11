import type { Theme } from '@mariozechner/pi-coding-agent'
import {
  CURSOR_MARKER,
  Container,
  Input,
  Spacer,
  Text,
  fuzzyFilter,
  getKeybindings,
  type Component,
} from '@mariozechner/pi-tui'

export class SelectFilterList<T> extends Container {
  searchInput: Input
  _focused = false
  listContainer: Container
  filteredChoices: T[]
  selectedIndex = 0

  get focused() {
    return this._focused
  }

  set focused(value) {
    this._focused = value
    this.searchInput.focused = value
  }

  constructor(
    private readonly theme: Theme,
    private readonly choices: T[],
    private readonly options: {
      title: string
      placeholder: string
      searchText: (item: T) => string
      formatItem: (item: T, opts: { isSelected: boolean; theme: Theme }) => string
      getCurrentValue?: (item: T) => string | undefined
      currentValue?: string
    },
    private readonly onSelectCallback: (choice: T) => void,
    private readonly onCancelCallback: () => void,
  ) {
    super()
    this.filteredChoices = choices

    const borderFn = (s: string) => theme.fg('border', s)
    const dim = (s: string) => theme.fg('dim', s)

    this.addChild(dynamicBorder(borderFn))
    this.addChild(new Text(theme.bold(options.title), 1, 0))
    this.addChild(new Spacer(1))

    this.searchInput = new SearchInput(options.placeholder, theme)
    this.searchInput.onEscape = () => this.onCancelCallback()
    this.searchInput.onSubmit = () => {
      const choice = this.filteredChoices[this.selectedIndex]
      if (choice) this.onSelectCallback(choice)
    }
    this.addChild(this.searchInput)
    this.addChild(new Spacer(1))

    this.listContainer = new Container()
    this.addChild(this.listContainer)
    this.addChild(new Spacer(1))
    this.addChild(new Text(dim('(escape/ctrl+c to cancel)'), 1, 0))
    this.addChild(dynamicBorder(borderFn))

    this.updateList()
  }

  handleInput(keyData: string) {
    const kb = getKeybindings()

    if (kb.matches(keyData, 'tui.select.up')) {
      if (this.filteredChoices.length === 0) return
      this.selectedIndex =
        this.selectedIndex === 0 ? this.filteredChoices.length - 1 : this.selectedIndex - 1
      this.updateList()
      return
    }

    if (kb.matches(keyData, 'tui.select.down')) {
      if (this.filteredChoices.length === 0) return
      this.selectedIndex =
        this.selectedIndex === this.filteredChoices.length - 1 ? 0 : this.selectedIndex + 1
      this.updateList()
      return
    }

    if (kb.matches(keyData, 'tui.select.confirm')) {
      const choice = this.filteredChoices[this.selectedIndex]
      if (choice) this.onSelectCallback(choice)
      return
    }

    if (kb.matches(keyData, 'tui.select.cancel')) {
      this.onCancelCallback()
      return
    }

    this.searchInput.handleInput(keyData)
    this.filterChoices(this.searchInput.getValue())
  }

  private filterChoices(query: string) {
    this.filteredChoices = query
      ? fuzzyFilter(this.choices, query, this.options.searchText)
      : this.choices
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredChoices.length - 1))
    this.updateList()
  }

  private updateList() {
    this.listContainer.clear()

    if (this.filteredChoices.length === 0) {
      this.listContainer.addChild(new Text(this.theme.fg('dim', '  No matching items'), 0, 0))
      return
    }

    const maxVisible = 10
    const startIndex = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(maxVisible / 2),
        this.filteredChoices.length - maxVisible,
      ),
    )
    const endIndex = Math.min(startIndex + maxVisible, this.filteredChoices.length)

    for (let i = startIndex; i < endIndex; i++) {
      const choice = this.filteredChoices[i]
      if (!choice) continue
      this.listContainer.addChild(
        new Text(
          this.options.formatItem(choice, {
            isSelected: i === this.selectedIndex,
            theme: this.theme,
          }),
          0,
          0,
        ),
      )
    }

    this.listContainer.addChild(
      new Text(
        this.theme.fg('dim', `  (${this.selectedIndex + 1}/${this.filteredChoices.length})`),
        0,
        0,
      ),
    )
  }
}

function dynamicBorder(colorFn: (s: string) => string): Component {
  return {
    invalidate() {},
    render(width: number) {
      return [colorFn('─'.repeat(Math.max(1, width)))]
    },
  }
}

class SearchInput extends Input {
  constructor(
    private readonly placeholder: string,
    private readonly theme: Theme,
  ) {
    super()
  }

  override render(width: number) {
    if (this.getValue()) return super.render(width)

    const prompt = '> '
    if (width <= prompt.length) return [prompt]

    const cursor = `${this.focused ? CURSOR_MARKER : ''}\x1b[7m \x1b[27m`
    const availableWidth = Math.max(0, width - prompt.length - 1)
    const placeholder = this.placeholder.slice(0, availableWidth)
    const padding = ' '.repeat(Math.max(0, availableWidth - placeholder.length))
    return [`${prompt}${cursor}${this.theme.fg('dim', placeholder)}${padding}`]
  }
}
