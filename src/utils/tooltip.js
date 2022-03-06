import { h, Component } from 'preact';
import tippy from 'tippy.js'
import '../styles/tooltip.css';

export default class ToolTip extends Component {
  componentDidMount() {
    this.tippy = tippy(this.base, Object.assign({ delay: [1000, null] }, this.props))
  }

  componentWillUnmount() {
    this.tippy.destroy()
  }

  render(props) {
    return props.children
  }
}
