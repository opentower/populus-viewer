import { h, createRef, Component } from 'preact';
import * as Icons from '../icons'
import "../styles/copyButton.css"
import ToolTip from "./tooltip.js"

export default class CopyButton extends Component {
  constructor(props) {
    super(props)
    this.state = { content: "copy to clipboard" }
  }

  tooltip = createRef()

  handleClick = () => {
    navigator.clipboard.writeText(this.props.copy)
      .then(_ => {
        this.setState({content:"copied!"}, 
          _ => this.tooltip.current.show())
      })
  }

  render(props, {content}) {
    return <ToolTip ref={this.tooltip} content={content}>
      <button onClick={this.handleClick} type="button" class="copy-button">{Icons.copy}</button>
    </ToolTip>
  }
}
