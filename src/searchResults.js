import { h, Fragment, createRef, Component } from 'preact';
import './styles/searchResults.css'
import * as Icons from "./icons.js"

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

  componentDidMount() {
    this.initializeSearch()
    document.addEventListener('keydown', this.handleKeydown)
  }

  componentWillUnmount () {
    document.removeEventListener('keydown', this.handleKeydown)
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.props.searchString !== prevProps.searchString && this.props.pdfText) this.initializeSearch()
    else if (this.state.searchLimit > prevState.searchLimit && this.props.pdfText) this.expandSearch()
  }

  initializeSearch () {
    if (this.props.searchString.length < 3) return
    const searchResults = []
    for (const [page, text] of Object.entries(this.props.pdfText)) {
      let idx = text.toLowerCase().indexOf(this.props.searchString.toLowerCase())
      const contexts = []
      while (idx > -1) {
        contexts.push(text.slice(Math.max(0, idx - 15), idx + this.props.searchString.length + 15))
        idx = text.toLowerCase().indexOf(this.props.searchString.toLowerCase(), idx + 1)
      }
      if (contexts.length > 0) searchResults.push({ page, contexts })
      if (searchResults.length > 20) break
    }
    this.setState({focusedResult: null, searchResults, searchLimit: 20})
  }

  expandSearch () {
    if (this.props.searchString.length < 3) return
    const searchResults = this.state.searchResults
    const oldPage = searchResults.slice(-1)[0].page
    for (const [page, text] of Object.entries(this.props.pdfText)) {
      if (parseInt(page, 10) > parseInt(oldPage, 10)) {
        let idx = text.toLowerCase().indexOf(this.props.searchString.toLowerCase())
        const contexts = []
        while (idx > -1) {
          contexts.push(text.slice(Math.max(0, idx - 15), idx + this.props.searchString.length + 15))
          idx = text.toLowerCase().indexOf(this.props.searchString.toLowerCase(), idx + 1)
        }
        if (contexts.length > 0) searchResults.push({ page, contexts })
        if (searchResults.length > this.state.searchLimit) break
      }
    }
    this.setState({searchResults}, _ => {
      this.limitRaised = false
    })
  }

  clearSearch = _ => this.props.setSearch(null)

  setFocus = focus => this.setState({ focusedResult: focus })

  focusNext = _ => {
    if (this.state.focusedResult === null) this.setFocus(0)
    else if (this.state.focusedResult <= this.state.searchResults.length) this.setFocus(this.state.focusedResult + 1)
  }

  focusPrev = _ => {
    if (this.state.focusedResult === null) return
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

  render(props, state) {
    return <div ref={this.resultListing}
      id="pdf-search-result-panel"
      onscroll={this.handleScroll}
      class={props.class} >
      {this.props.pdfText
        ? <Fragment>
          <div id="pdf-search-term">
            <div><b>Search Results For:</b>
              <span onclick={this.clearSearch}
                class="small-icon">{Icons.close}
              </span>
            </div>
            {props.searchString}
          </div>
          {state.searchResults.map((result, idx) => <SearchResult
            pushHistory={props.pushHistory}
            key={result.page}
            result={result}
            focusedResult={state.focusedResult}
            setFocus={this.setFocus}
            index={idx}
          />
          )}
        </Fragment>
        : <div id="pdf-search-warn"><b>Indexing Pdf, Please Wait...</b></div>
        }
    </div>
  }
}

class SearchResult extends Component {
  focus = _ => {
    this.props.setFocus(this.props.index)
    this.props.pushHistory({pageFocused: parseInt(this.props.result.page, 10)})
    this.result.current.scrollIntoView()
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
