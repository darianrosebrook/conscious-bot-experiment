/* global XMLHttpRequest */
import * as THREE from 'three'

const textureCache = {}
function loadTexture (texture, cb) {
  if (textureCache[texture]) {
    cb(textureCache[texture])
    return
  }
  const loader = new THREE.TextureLoader()
  loader.load(texture, (tex) => {
    textureCache[texture] = tex
    cb(tex)
  })
}

function loadJSON (url, callback) {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url, true)
  xhr.responseType = 'json'
  xhr.onload = function () {
    const status = xhr.status
    if (status === 200) {
      callback(xhr.response)
    } else {
      throw new Error(url + ' not found')
    }
  }
  xhr.send()
}

export { loadTexture, loadJSON }
