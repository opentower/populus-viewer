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

  searchInput = this.props.searchInput || createRef()

  keydownHandler = e => {
    const searchPredicate = this.props.searchPredicate ||
      (e => e.key === "/" && !e.altKey && !e.ctrlKey)
    if (searchPredicate(e)) {
      e.preventDefault()
      this.searchInput.current.focus()
    }
  }

  handleClear = e => {
    e.preventDefault()
    this.props.setSearch("")
  }

  handleInputBlur = _ => this.props.setFocus ? this.props.setFocus(false) : null

  handleInputFocus = _ => this.props.setFocus ? this.props.setFocus(true) : null

  handleInputKeydown = e => {
    e.stopPropagation() // don't propagate to global keypress handlers
    if (e.key === "Esc" || e.key === "Escape") this.searchInput.current.blur()
  }

  handleInput = e => this.props.setSearch(e.target.value)

  render(props, _) {
    return <div title={props.title} class="search-bar">
      <input ref={this.searchInput}
        value={props.search}
        onkeydown={this.handleInputKeydown}
        onInput={this.handleInput}
        onBlur={this.handleInputBlur}
        onFocus={this.handleInputFocus} />
      <div class={"search-icon"}>{Icons.search }</div>
      <div onmousedown={this.handleClear}
        title={props.search ? "Clear current search" : null}
        class={"right-decoration"}>
        {props.search
          ? Icons.close
          : props.hint ? <span class="search-hint">{props.hint}</span> : null
        }
      </div>
    </div>
  }
}
