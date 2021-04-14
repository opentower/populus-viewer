import { h, render, Fragment, Component } from 'preact';
import './styles/splash.css'

export default class SplashView extends Component {

    pollInitialized = () => {
        if (this.props.client.isInitialSyncComplete()) {
            this.props.setInitialized()
        } else {
            console.log("poll!")
            setTimeout(this.pollInitialized,1000)
        }
    }


    componentDidMount() { 
        setTimeout(this.pollInitialized,3000)
    }

    render (props,state) {
        return <div id="splash-wrapper">
                    <div id="splash-logo">Populus</div>
                    <div id="splash-loader">loading...</div>
               </div>
    }
}
