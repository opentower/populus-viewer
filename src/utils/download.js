export function downloadBlob(blob, filename, mimetype) {
    // slice here lets us potentially avoid creating another copy of the blob
    // just to change the mimetype
    const url = window.URL.createObjectURL(blob.slice(0, blob.size, mimetype))
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(function() {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}
