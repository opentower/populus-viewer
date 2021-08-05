import { h, Fragment, createRef, Component } from 'preact';
import './styles/searchResults.css'
import * as Icons from "./icons.js"

export default class SearchResults extends Component {
  constructor(props) {
    super(props)
    this.state = {
      searchResults: [],
      searchLimit: 20
    }
  }

  resultListing = createRef()

  componentDidUpdate(prevProps, prevState) {
    if (this.props.searchString !== prevProps.searchString &&
      this.props.pdfText
    ) {
      const searchResults = []
      for (const [page, text] of Object.entries(this.props.pdfText)) {
        let idx = text.indexOf(this.props.searchString)
        const contexts = []
        while (idx > -1) {
          contexts.push(text.slice(Math.max(0, idx - 15), idx + this.props.searchString.length + 15))
          idx = text.indexOf(this.props.searchString, idx + 1)
        }
        if (contexts.length > 0) searchResults.push({ page, contexts })
        if (searchResults.length > 20) break
      }
      this.setState({searchResults, searchLimit: 20}) // state update here is safe, we've included a guard
    } else if (this.state.searchLimit > prevState.searchLimit && this.props.pdfText) {
      const searchResults = this.state.searchResults
      const oldPage = searchResults.slice(-1)[0].page
      for (const [page, text] of Object.entries(this.props.pdfText)) {
        if (parseInt(page,10) > parseInt(oldPage,10)) {
          let idx = text.indexOf(this.props.searchString)
          const contexts = []
          while (idx > -1) {
            contexts.push(text.slice(Math.max(0, idx - 15), idx + this.props.searchString.length + 15))
            idx = text.indexOf(this.props.searchString, idx + 1)
          }
          if (contexts.length > 0) searchResults.push({ page, contexts })
          if (searchResults.length > this.state.searchLimit) break
        }
      }
      this.setState({searchResults}, _ => {
        this.limitRaised = false
      }) // state update here is safe, we've included a guard
    }
  }

  clearSearch = _ => this.props.setSearch(null)

  handleScroll = _ => {
    const toBottom = this.resultListing.current.scrollHeight - this.resultListing.current.clientHeight - this.resultListing.current.scrollTop
    if (toBottom < 100 && !this.limitRaised) {
      this.limitRaised = true
      this.setState(oldState => { return {searchLimit: oldState.searchLimit + 20} })
    }
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
          {state.searchResults.map(result => <SearchResult
            pushHistory={props.pushHistory}
            key={result.page}
            result={result}
          />
          )}
        </Fragment>
        : <div id="pdf-search-warn"><b>Indexing Pdf, Please Wait...</b></div>
        }
    </div>
  }
}

class SearchResult extends Component {
  handleClick = _ => {
    this.props.pushHistory({pageFocused: parseInt(this.props.result.page, 10)})
  }

  render(props) {
    return <div onClick={this.handleClick} class="pdf-search-result">
      {props.result.contexts.map((context, idx) =>
        <div key={`${props.result.page}-${idx}`} class="result-context">… {context} …</div>)
      }
      <div class="page-data">page: {props.result.page} </div>
    </div>
  }
}
