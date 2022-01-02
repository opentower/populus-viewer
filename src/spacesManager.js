import { h, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import './styles/spacesManager.css'
import { RoomColor } from './utils/colors.js'

export default class SpacesManager extends Component {
  dummySpaces = ["Philosophy 101", "Philosophy of Computer Science"]
    .map(name => <SpaceListing key={name} name={name} />)

  render() {
    return <div id="spaces-manager">
      <h2>Collections</h2>
      <div id="spaces-list">
        {this.dummySpaces}
        <button id="create-space">+ Create New Collection</button>
      </div>
    </div>
  }
}

class SpaceListing extends Component {
  roomColor = new RoomColor(this.props.name)

  dummyChildren = ["A", "Z", "R"]
    .map(name => <SpaceListingChild key={name} name={name} />)

  render(props) {
    return <div style={this.roomColor.styleVariables} class="space-listing">
      <h4> {props.name} </h4>
      <div class="space-listing-children">
        {this.dummyChildren}
      </div>
    </div>
  }
}

class SpaceListingChild extends Component {
  roomColor = new RoomColor(this.props.name)

  render(props) {
    return <div class="space-listing-child" style={this.roomColor.styleVariables}>{props.name}</div>
  }
}
