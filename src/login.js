import { h, render, Fragment, Component } from 'preact';

export default class LoginView extends Component {
    render(props,state) {
        this.client = props.client
        return <div><LoginModal client={props.client}/></div>
    }
}

class LoginModal extends Component {

    constructor (props) {
        super()
        this.client = props.client
    }

    handleLogin = (e) => {
        e.preventDefault()
        const loginForm = document.getElementById("loginForm")
        const formdata = new FormData(loginForm)
        const entries = Array.from(formdata.entries()).map(i => i[1])
        this.client.loginWithPassword(entries[0],entries[1])
            .then(_ => {
                window.dispatchEvent(new CustomEvent('login'))
            })
    }

    render(props,state) {
        return (
            <div id="loginModal">
                <h3>Login To Populus</h3>
                <form id="loginForm">
                    <div>
                        <label for="username">Username</label>
                        <input type="text" id="username" name="username"></input>
                    </div>
                    <div>
                        <label for="password">Password</label>
                        <input type="text" id="password" name="password"></input>
                    </div>
                    <div>
                        <button onclick={this.handleLogin} >Login</button>
                    </div>
                </form>
            </div>
        )
    }
}

