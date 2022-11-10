import { h, Component } from 'preact';
import tippy from 'tippy.js'
import '../styles/tooltip.css';

export default class ToolTip extends Component {
  componentDidMount() {
    this.tippy = tippy(this.base, Object.assign({
      delay: [1500, null],
      touch: ["hold", 1000]
    }, this.props))
    this.base.addEventListener("focusout", this.tippy.hide())
    this.base.setAttribute("aria-label", this.props.content)
  }

  componentWillUnmount() {
    this.tippy.destroy()
  }

  componentDidUpdate(prev) {
    if (prev.content !== this.props.content) this.tippy.setProps(this.props) 
  }

  show() {
    this.tippy.show()
  }

  hide() {
    this.tippy.show()
  }

  render(props) {
    return props.children
  }
}
