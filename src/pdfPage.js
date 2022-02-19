import { h, createRef, Component } from 'preact';
import AnnotationLayer from "./annotation.js"
import PdfCanvas from "./pdfCanvas.js"

export default class PdfPage extends Component {
  render(props) {
    return <div id="document-wrapper" data-annotations-hidden={!props.annotationsVisible}>
      <PdfCanvas
        setPdfWidthPx={props.setPdfWidthPx}
        setPdfDimensions={props.setPdfDimensions}
        setPdfFitRatio={props.setPdfFitRatio}
        pdfScale={props.pdfScale}
        annotationLayer={props.annotationLayer}
        textLayer={props.textLayer}
        searchString={props.searchString}
        pdfFocused={props.pdfFocused}
        pageFocused={props.pageFocused}
        initFocus={props.initFocus}
        setId={props.setId}
        setTotalPages={props.setTotalPages}
        setPdfText={props.setPdfText}
        setPdfLoadingStatus={props.setPdfLoadingStatus}
      />
      <AnnotationLayer
        ref={props.annotationLayer}
        pindropMode={props.pindropMode}
        annotationLayerWrapper={props.annotationLayerWrapper}
        filteredAnnotationContents={props.filteredAnnotationContents}
        pdfWidthAdjustedPx={props.pdfWidthAdjustedPx}
        pdfHeightAdjustedPx={props.pdfHeightAdjustedPx}
        zoomFactor={props.zoomFactor}
        pageFocused={props.pageFocused}
        roomId={props.roomId}
        setFocus={props.setFocus}
        focus={props.focus}
        secondaryFocus={props.secondaryFocus}
      />
    </div>
  }
}
