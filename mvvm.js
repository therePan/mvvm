function Mvvm(options = {}) {
  // 把options 赋值给this.$options
  this.$options = options
  // 把options.data赋值给this._data
  let data = this._data = this.$options.data
  let compute = this._computed = this.$options.computed
  let vm = initVm.call(this)
  initComputed.call(this) // 添加计算函数，改变this指向
  initObserve.call(this, data) // 初始化data的Observe，添加proxy拦截
  new Compile(this.$options.el, vm) // 添加一个编译函数
  return this._vm
}


function initVm() {
  this._vm = new Proxy(this, {
    // 拦截get
    get: (target, key, receiver) => {
      return this[key] || this._data[key] || this._computed[key]
    },
    // 拦截set
    set: (target, key, value) => {
      return Reflect.set(this._data, key, value)
    }
  })
  return this._vm
}

function initComputed() {
  let vm = this
  let computed = this.$options.computed // 拿到配置的computed
  vm._computed = {}
  if (!computed) return // 没有计算直接返回
  Object.keys(computed).forEach(key => {
    // 相当于把sum里的this指向到this._vm，然后就可以拿到this.a、this、b
    this._computed[key] = computed[key].call(this._vm)
    // 添加新的Watcher
    new Watcher(this._vm, key, val => {
      // 每次设置的时候都会计算
      this._computed[key] = computed[key].call(this._vm)
    })
  })
}


function initObserve(data) {
  this._data = observe(data) // 把所有observe都赋值到 this._data
}



// 分开这个主要是为了下面递归调用
function observe(data) {
  if (!data || typeof data !== 'object') return data // 如果不是对象直接返回值
  return new Observe(data) // 对象调用Observe
}

// Observe类
class Observe {
  constructor(data) {
    this.dep = new Dep() // 订阅类，后面会介绍
    for (let key in data) {
      data[key] = observe(data[key]) // 递归调用子对象
    }
    return this.proxy(data)
  }
  proxy(data) {
    let dep = this.dep
    return new Proxy(data, {
      get: (target, prop, receiver) => {


        if (Dep.target) {
          // 如果之前是push过的，就不用重复push了
          if (!dep.subs.includes(Dep.exp)) {

            // dep.addSub(Dep.exp) // 把Dep.exp。push到sub数组里面，订阅
            dep.addSub(Dep.target) // 把Dep.target。push到sub数组里面，订阅

          }
        }
        return Reflect.get(target, prop, receiver)
      },
      // 拦截set
      set: (target, prop, value) => {
        const result = Reflect.set(target, prop, observe(value))
        dep.notify() // 发布
        return result
      }

    })
  }
}

// 编译类
class Compile {
  constructor(el, vm) {
    this.vm = vm // 把传进来的vm 存起来，因为这个vm.a = 1 没毛病
    let element = document.querySelector(el) // 拿到 app 节点
    let fragment = document.createDocumentFragment() // 创建fragment代码片段
    fragment.append(element) // 把app节点 添加到 创建fragment代码片段中    

    this.replace(element) // 套数据函数
    document.body.appendChild(element) // 最后添加到body中
  }
  replace(frag) {
    let vm = this.vm // 拿到之前存起来的vm
    // 循环frag.childNodes
    Array.from(frag.childNodes).forEach(node => {
      let txt = node.textContent // 拿到文本 例如："开发语言：{{language}}"
      let reg = /\{\{(.*?)\}\}/g // 定义匹配正则

      // 判断nodeType
      if (node.nodeType === 1) {
        const nodeAttr = node.attributes // 属性集合
        Array.from(nodeAttr).forEach(item => {
          let name = item.name // 属性名
          let exp = item.value // 属性值
          // 如果属性有 v-
          if (name.includes('v-')) {
            node.value = vm[exp]
            node.addEventListener('input', e => {
              // 相当于给this.language赋了一个新值
              // 而值的改变会调用set，set中又会调用notify，notify中调用watcher的update方法实现了更新操作
              vm[exp] = e.target.value
            })
          }
        });
      }


      if (node.nodeType === 3 && reg.test(txt)) {
        replaceTxt()
        function replaceTxt() {
          // 如果匹配到的话，就替换文本
          node.textContent = txt.replace(reg, (matched, placeholder) => {

            new Watcher(vm, placeholder, replaceTxt);   // 监听变化，进行匹配替换内容
            return placeholder.split('.').reduce((obj, key) => {
              return obj[key] // 例如：去vm.makeUp.one对象拿到值
            }, vm)
          })
        }
      }
      // 如果还有字节点，并且长度不为0 
      if (node.childNodes && node.childNodes.length) {
        // 直接递归匹配替换
        this.replace(node)
      }
    })
  }
}


// 订阅类
class Dep {
  constructor() {
    this.subs = [] // 定义数组
  }
  // 订阅函数
  addSub(sub) {
    // console.log(sub,'====');

    this.subs.push(sub)
  }
  // 发布函数
  notify() {
    this.subs.filter(item => typeof item !== 'string').forEach(sub => sub.update())
  }
}

// Watcher类
class Watcher {
  constructor(vm, exp, fn) {
    this.fn = fn // 传进来的fn
    this.vm = vm // 传进来的vm
    this.exp = exp // 传进来的匹配到exp 例如："language"，"makeUp.one"
    Dep.exp = exp // 给Dep类挂载一个exp
    Dep.target = this // 给Dep类挂载一个watcher对象，跟新的时候就用到了
    let arr = exp.split('.')
    let val = vm
    arr.forEach(key => {
      val = val[key] // 获取值，这时候会粗发vm.proxy的get()函数，get()里面就添加addSub订阅函数
    })
    Dep.target = null // 添加了订阅之后，把Dep.target清空
  }
  update() {
    // 设置值会触发vm.proxy.set函数，然后调用发布的notify，
    // 最后调用update，update里面继续调用this.fn(val)
    let exp = this.exp
    let arr = exp.split('.')
    let val = this.vm
    arr.forEach(key => {
      val = val[key]
    })
    this.fn(val)
  }
}

