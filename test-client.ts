import Tonpleun from './src/clientLib'

async function main() {
    const tp = new Tonpleun('testClient')
    await tp.registerService('hello_world', [], () => {
        return 'hello world'
    })
    console.log('init done')
}

main()