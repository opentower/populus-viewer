import { h, render, Fragment, Component } from 'preact';

export default class WelcomeView extends Component {

    render(props,state) {
        return (<div> WelcomeView <Logout/> </div>)
    }
}

class Logout extends Component {

    handleClick = (e) => {
            e.preventDefault()
            window.dispatchEvent(new CustomEvent('logout'))
    }

    render (props,state) {
        return <a href='#' onclick={this.handleClick}>logout</a>
    }
}
