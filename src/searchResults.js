import { h, Fragment, createRef, Component } from 'preact';
import './styles/searchResults.css'
import * as Icons from "./icons.js"
import History from "./history.js"
import SearchBar from './search.js'

export default class SearchResults extends Component {
  constructor(props) {
    super(props)
    this.state = {
      searchResults: [],
      searchLimit: 20,
      focusedResult: null
    }
  }

  resultListing = createRef()

  searchInput = createRef()

  componentDidMount() {
    this.initializeSearch()
    document.addEventListener('keydown', this.handleKeydown)
    this.searchInput.current.focus()
  }

  componentWillUnmount () {
    document.removeEventListener('keydown', this.handleKeydown)
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.props.searchString !== prevProps.searchString && this.props.pdfText) this.initializeSearch()
    else if (this.state.searchLimit > prevState.searchLimit && this.props.pdfText) this.expandSearch()
  }
  
  resetSearch() {
    this.setState({
      searchResults: [],
      searchLimit: 20,
      focusedResult: null
    })
  }

  initializeSearch () {
    if (this.props.searchString.length < 3) {
      this.resetSearch()
      return
    }
    const searchResults = []
    // We strip out all non-alphanumerics, for fuzzy search
    const word = this.props.searchString.toLowerCase().replace(/[^a-zA-Z0-9]/gm, "")
    for (const [page, text] of Object.entries(this.props.pdfText)) {
      const cleantext = text.toLowerCase().replace(/[^a-zA-Z0-9]/gm, "")
      const contexts = []
      let idx = cleantext.indexOf(word)
      let idx2 = idx + word.length
      while (idx > -1) {
        let before = true
        let start = 0
        let end = 0
        let counter = 0
        for (const letter of text) {
          if (before && counter === idx) before = false
          if (!before && counter === idx2) {
            contexts.push(text.slice(Math.max(0, start - 15), end + 40))
            idx = cleantext.indexOf(word, idx + 1)
            idx2 = idx + word.length
            break
          }
          if (before) start++
          if (letter.match(/[a-zA-Z0-9]/)) counter++
          end++
        }
      }
      if (contexts.length > 0) searchResults.push({ page, contexts })
      if (searchResults.length > 20) break
    }
    this.setState({focusedResult: null, searchResults, searchLimit: 20})
  }

  expandSearch () {
    if (this.props.searchString.length < 3) {
      this.resetSearch()
      return
    }
    const searchResults = this.state.searchResults
    const oldPage = searchResults.slice(-1)[0].page
    const word = this.props.searchString.toLowerCase().replace(/[^a-zA-Z0-9]/gm, "")
    for (const [page, text] of Object.entries(this.props.pdfText)) {
      if (parseInt(page, 10) > parseInt(oldPage, 10)) {
        const cleantext = text.toLowerCase().replace(/[^a-zA-Z0-9]/gm, "")
        let idx = cleantext.indexOf(word)
        let idx2 = idx + word.length
        const contexts = []
        while (idx > -1) {
          let before = true
          let start = 0
          let end = 0
          let counter = 0
          for (const letter of text) {
            if (before && counter === idx) before = false
            if (!before && counter === idx2) {
              contexts.push(text.slice(Math.max(0, start - 15), end + 40))
              idx = cleantext.indexOf(word, idx + 1)
              idx2 = idx + word.length
              break
            }
            if (before) start++
            if (letter.match(/[a-zA-Z0-9]/)) counter++
            end++
          }
        }
        if (contexts.length > 0) searchResults.push({ page, contexts })
        if (searchResults.length > this.state.searchLimit) break
      }
    }
    this.setState({searchResults}, _ => {
      this.limitRaised = false
    })
  }

  setFocus = focus => this.setState({ focusedResult: focus })

  focusNext = _ => {
    if (this.state.focusedResult === null) this.setFocus(0)
    else if (this.state.focusedResult + 1 < this.state.searchResults.length) this.setFocus(this.state.focusedResult + 1)
  }

  focusPrev = _ => {
    if (this.state.focusedResult === null) this.setFocus(this.state.searchResults.length - 1)
    if (this.state.focusedResult > 0) this.setFocus(this.state.focusedResult - 1)
  }

  handleScroll = _ => {
    const toBottom = this.resultListing.current.scrollHeight - this.resultListing.current.clientHeight - this.resultListing.current.scrollTop
    if (toBottom < 100 && !this.limitRaised) {
      this.limitRaised = true
      this.setState(oldState => { return {searchLimit: oldState.searchLimit + 20} })
    }
  }

  handleKeydown = e => {
    if (e.altKey && !e.shiftKey && e.key === 'Tab') this.focusNext()
    if (e.altKey && e.shiftKey && e.key === 'Tab') this.focusPrev()
  }

  handleBlur = _ => {
    if (this.props.searchString.length < 1) this.props.endSearch()
  }

  render(props, state) {
    return <div ref={this.resultListing}
      id="pdf-search-result-panel"
      onscroll={this.handleScroll}
      class={props.class} >
      {this.props.pdfText
        ? <Fragment>
          <div id="pdf-search-term">
            <div><b>Результати пошуку для:</b></div>
            <SearchBar
              hint="Alt-/"
              searchInput={this.searchInput}
              onBlur={this.handleBlur}
              search={props.searchString}
              setSearch={props.setSearch} />
          </div>
          {state.searchResults.map((result, idx) => <SearchResult
            roomFocused={props.roomFocused}
            resourceAlias={props.resourceAlias}
            key={result.page}
            result={result}
            hideListing={props.hideListing}
            focusedResult={state.focusedResult}
            setFocus={this.setFocus}
            index={idx}
          />
          )}
        </Fragment>
        : <div id="pdf-search-warn"><b>Індексація Pdf, Зачекайте будьласка...</b></div>
        }
    </div>
  }
}

class SearchResult extends Component {
  focus = _ => {
    this.props.setFocus(this.props.index)
    const newUrl = `/${encodeURIComponent(this.props.resourceAlias)}/${this.props.result.page}/${this.props.roomFocused ? this.props.roomFocused : ""}`
    History.push(newUrl)
    this.result.current.scrollIntoView()
    const narrow = document.body.offsetWidth <= 600
    if (narrow) this.props.hideListing()
  }

  result = createRef()

  componentDidUpdate(prevProps) {
    if (this.props.focusedResult !== prevProps.focusedResult &&
      this.props.index === this.props.focusedResult) {
      this.focus()
    }
  }

  render(props) {
    return <div ref={this.result} onClick={this.focus} data-focused-result={props.index === props.focusedResult} class="pdf-search-result">
      {props.result.contexts.map((context, idx) =>
        <div key={`${props.result.page}-${idx}`} class="result-context">… {context} …</div>)
      }
      <div class="page-data">page: {props.result.page} </div>
    </div>
  }
}
