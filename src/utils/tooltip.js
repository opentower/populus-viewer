import { h, Component } from 'preact';
import tippy from 'tippy.js'
import '../styles/tooltip.css';

export default class ToolTip extends Component {
  componentDidMount() {
    this.tippy = tippy(this.base, Object.assign({
      delay: [1000, null],
      touch: ["hold", 1000]
    }, this.props))
  }

  componentWillUnmount() {
    this.tippy.destroy()
  }

  render(props) {
    return props.children
  }
}
