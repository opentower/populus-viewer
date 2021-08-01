import { h, Component, createRef } from 'preact';
import * as Icons from './icons.js'
import './styles/search.css'

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
    return <div id="search-bar">
      <input ref={this.searchInput}
        value={props.searchFilter}
        onkeydown={this.handleInputKeydown}
        onInput={this.handleInput}
        onBlur={this.handleInputBlur}
        onFocus={this.handleInputFocus} />
      {Icons.search}
    </div>
  }
}
