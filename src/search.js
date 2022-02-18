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
    this.searchInput.current.focus()
  }

  handleInputBlur = e => {
    this.props.setFocus ? this.props.setFocus(false) : null
    this.props.onBlur ? this.props.onBlur(e) : null
  }

  handleInputFocus = e => {
    this.props.setFocus ? this.props.setFocus(true) : null
    this.props.onFocus ? this.props.onFocus(e) : null
  }

  handleInputKeydown = e => {
    if (!e.altKey && !e.ctrlKey) e.stopPropagation() // don't propagate to global keypress handlers
    if (e.key === "Esc" || e.key === "Escape") this.searchInput.current.blur()
    if (e.key === "Enter" && this.props.submit ) this.props.submit(this.props.search)
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
