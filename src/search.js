import { h, Component, createRef } from 'preact';
import * as Icons from './icons.js'

export default class SearchBar extends Component {
  componentDidMount () {
    document.addEventListener('keydown', this.keydownHandler)
  }

  componentWillUnmount () {
    document.removeEventListener('keydown', this.keydownHandler)
  }

  searchInput = createRef()

  keydownHandler = e => {
    if (e.key === "/") {
      e.preventDefault()
      this.searchInput.current.focus()
    }
  }

  handleInputBlur = _ => this.props.setFocus(false)

  handleInputFocus = _ => this.props.setFocus(true)

  handleInputKeydown = e => {
    e.stopPropagation() // don't propagate to global keypress handlers
    if (e.key === "Esc" || e.key === "Escape") this.searchInput.current.blur()
  }

  handleInput = e => this.props.setSearch(e.target.value)

  render(props, _) {
    return <div id="welcome-search">
      <input id="welcome-search-input"
        value={props.searchFilter}
        ref={this.searchInput}
        onkeydown={this.handleInputKeydown}
        onInput={this.handleInput}
        onBlur={this.handleInputBlur}
        onFocus={this.handleInputFocus} />
      {Icons.search}
    </div>
  }
}
