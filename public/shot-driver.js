/*
 * 截图演示驱动（临时文件，截完即删）
 *
 * 做法：拦住 window.fetch，按请求特征喂假响应，让应用自己把整个流程走完。
 * 截出来的是真实渲染的界面，不是照着截图画的静态图。
 *
 * 用 ?shot=N 选剧本：
 *   1 填想法  2 讨论  3 约定  4 生成中  5 方案
 */
;(function () {
  'use strict'

  var SHOT = new URLSearchParams(location.search).get('shot') || '1'

  // ═══════════════════════ 假数据 ═══════════════════════

  var BRIEF_TEXT = '周日下午想和女朋友在西湖拍一组，偏过曝的日系小清新，想要生活感，不要摆拍'

  var DISCUSS_OPENING = [
    '先跟你对一下几个关键点。',
    '',
    '「偏过曝 + 日系小清新 + 生活感」这三样凑一起，落到拍摄上其实是三件事：',
    '',
    '一是时间。想要那种通透发灰的调子，下午 15:30 之后光才软下来。正午顶光拍出来脸上是硬阴影，跟小清新正好反着。',
    '',
    '二是服装色系。你俩的调子要统一但别撞——女生往米白、浅蓝这边走，男生白衬衫配卡其。纯黑和亮色 Logo 尽量避开，一进画面就把调子压下去了。',
    '',
    '三是动作。要生活感就得少摆姿势，用走动和说话代替「看镜头笑一个」。',
    '',
    '两个问题：',
    '',
    '1. 你们俩平时相处是爱闹的那种，还是偏安静的？',
    '2. 西湖这段有没有特别想拍到的？水面、柳树，或者哪条具体的路？',
  ].join('\n')

  var DISCUSS_REPLY = [
    '安静但一逗就笑——这个信息有用，那我按「低动作量、抓真实反应」来定，不给你设计摆拍动作。',
    '',
    '服装：女生米白棉麻长裙，外面搭一件浅色薄开衫，起风时开衫下摆会飘，比裙摆好抓。男生白色牛津纺衬衫、袖子挽到小臂，卡其或浅灰长裤。鞋子尽量浅色，深色鞋在浅色画面里很跳。',
    '',
    '道具：草帽（戴不戴都行，拿在手里挡个太阳也好用）、帆布包、一本封面素净的书。另外建议带把透明伞——万一下雨它就是主角，不下雨拍逆光也好看。',
    '',
    '光线：树影光斑放在 15:30–16:30 拍，太阳还高，叶子能投出清楚的斑。17:00 之后主光转逆光，那就换个拍法，专拍轮廓和过曝的天空。',
    '',
    '其他：避开苏堤尽头的游客密集段，不要拍正面合影，水面一定要入画——哪怕只占画面一条边。',
    '',
    '还有要补充的吗？没有的话我就整理成约定。',
  ].join('\n')

  var USER_MSG = '我们俩偏安静一点，但一逗就笑。想拍到湖面和柳树，最好是树影打在脸上那种感觉。'

  var CONSENSUS = {
    style: '偏过曝的日系小清新，高光提亮、通透发灰，整体低饱和',
    wardrobe:
      '女生：米白棉麻长裙 + 浅色薄开衫；男生：白色牛津纺衬衫（袖子挽到小臂）+ 卡其长裤。两人都避开大面积纯黑与亮色 Logo，鞋选浅色',
    props: '草帽、帆布包、一本封面素净的书；备用透明伞（下雨时即为主道具）',
    mood: '低动作量、抓真实反应，以走动和说话为主，不用摆拍姿势，笑要自然',
    notes: '必须有西湖水面入画；避开苏堤尽头游客密集段；不拍正面合影；15:30 后开拍，避开正午顶光',
  }

  var CARDS = {
    brief: {
      theme: '日系小清新情侣写真',
      location: '杭州 · 西湖苏堤与北山街',
      time: '周日下午 15:30–17:30',
      people: '情侣两人',
    },
    directions: [
      { id: 'd1', name: '湖边漫步', tagline: '沿着水边走，边走边聊，不摆姿势' },
      { id: 'd2', name: '柳荫光斑', tagline: '钻进柳树底下，等树影打在脸上' },
      { id: 'd3', name: '日落逆光', tagline: '赶在太阳落下去前，拍过曝的轮廓' },
    ],
  }

  var PLANS = [
    {
      title: '西湖漫步 · 日系小清新',
      scenes: [
        {
          title: '苏堤起步 · 并肩走',
          light: '15:30–16:00 侧顺光，光从右前方来，脸有立体感不硬',
          backup: false,
          shots: [
            {
              description:
                '两人并排沿湖走，摄影师在侧前方退着走、机位压到胸口高度，让柳枝和水面从两人头上越过去。焦点落在女生半边脸，不要两人都实。',
              poseTags: ['双人-牵手走'],
              tip: '就走你们的，随便聊点什么，别管镜头',
            },
            {
              description:
                '女生走快半步，回头找男生——这个回头的瞬间最值钱。摄影师站在她斜后方，用她的肩膀当前景，男生的脸虚一点。',
              poseTags: ['单人-回眸'],
              tip: '走两步突然回头，别笑，等他喊你',
            },
          ],
        },
        {
          title: '北山街 · 停下来看水',
          light: '16:00–16:40 侧逆光，水面反光强，人物适当提亮',
          backup: false,
          shots: [
            {
              description:
                '两人在路边停住，一起低头看湖面。机位从身后偏侧打过去，把两个人的背影和水里的倒影一起收进来。',
              poseTags: ['双人-同看远方'],
              tip: '找块石头靠着聊几句，我按快门的时候别停',
            },
            {
              description:
                '男生侧身站着、手插口袋，女生靠在他肩上，视线往湖面去。机位走正侧，用长焦压背景，把对岸收虚。',
              poseTags: ['双人-背靠背'],
              tip: '她就靠着你，你看湖面就行',
            },
          ],
        },
        {
          title: '雨天备案 · 撑伞走',
          light: '阴天散射光，光线均匀但发灰，需要后期提亮脸部',
          backup: true,
          shots: [
            {
              description:
                '透明伞撑起来，两人挤在伞下沿湖走。从伞下方往上取景，伞骨和水杉一起入画，人只占下半幅。',
              poseTags: ['双人-牵手走'],
              tip: '往我这边再挤一点，伞下得有你们两个人的脸',
            },
          ],
        },
      ],
    },
    {
      title: '柳荫光斑 · 西湖树下',
      scenes: [
        {
          title: '柳树下 · 斑驳光',
          light: '15:30–16:30 太阳还高，柳叶投出的斑最清楚',
          backup: false,
          shots: [
            {
              description:
                '两人坐在树下草地上，男生半躺、女生盘腿。机位略高俯拍，等一块光斑移到她眼睛旁边再按快门。',
              poseTags: ['双人-并肩坐'],
              tip: '听到我说「有了」的时候别动',
            },
            {
              description:
                '女生单手撑地半坐，仰头去接穿过柳叶的光，男生在旁边把草帽递过去。近景，只收上半身和一只手。',
              poseTags: ['单人-坐'],
              tip: '慢慢抬头，眼睛闭上，感受一下光',
            },
            {
              description:
                '两人额头抵在一起，闭着眼笑。侧逆光从叶缝漏下来，让发丝边缘亮起来。',
              poseTags: ['双人-拥抱'],
              tip: '额头碰一下，笑出来',
            },
          ],
        },
        {
          title: '草地边缘 · 蹲下来',
          light: '树影过渡带，明暗反差大，注意别让脸掉进暗部',
          backup: false,
          shots: [
            {
              description:
                '女生蹲在草坡边缘拨一株草，男生从后面走近。机位几乎贴地，前景用一丛草虚掉，把视线往她脸上引。',
              poseTags: ['单人-蹲'],
              tip: '就蹲着玩，不用看我',
            },
          ],
        },
        {
          title: '雨天备案 · 树下躲雨',
          light: '阴天散射光，颜色偏冷，适合低饱和处理',
          backup: true,
          shots: [
            {
              description:
                '两人站在大柳树下躲雨，伞收着。机位从树后往前拍，用垂下来的柳条框住两个人。',
              poseTags: ['双人-对视'],
              tip: '就站在那儿聊，雨声这么大你们得靠近点',
            },
          ],
        },
      ],
    },
    {
      title: '日落逆光 · 过曝轮廓',
      scenes: [
        {
          title: '西岸 · 逆光轮廓',
          light: '17:00–17:40 主光转逆光，天空过曝，人拍轮廓',
          backup: false,
          shots: [
            {
              description:
                '太阳压到湖面附近的时段，两人并排站在岸边，脸不用拍清楚。机位低一点，让人挡住太阳、边缘烧出一圈亮边。',
              poseTags: ['双人-同看远方'],
              tip: '站在那儿别动，让我用你们的头挡住太阳',
            },
            {
              description:
                '女生背对镜头往湖面走两步，逆光把开衫下摆和头发打透。快门速度提到 1/500 以上，别让走动糊掉。',
              poseTags: ['单人-背影'],
              tip: '慢慢往前走，别回头',
            },
          ],
        },
        {
          title: '回程 · 路灯刚亮',
          light: '17:40 后天空还有余亮的蓝调时刻，路灯混光',
          backup: false,
          shots: [
            {
              description:
                '天没全黑时拍最后一张。两人牵手往有灯的方向走，机位从后面跟，把路灯的暖光和天空的冷蓝一起收进来。',
              poseTags: ['双人-牵手走'],
              tip: '牵着手往回走，就当今天拍完了',
            },
          ],
        },
        {
          title: '雨天备案 · 屋檐灯下',
          light: '阴雨天无日头，改用北山街店铺的橱窗光作主光',
          backup: true,
          shots: [
            {
              description:
                '找个亮着灯的屋檐口，两人并排站着避雨。机位在雨里往外拍，玻璃和雨帘上的反光当前景。',
              poseTags: ['双人-并肩坐'],
              tip: '往灯光那边靠靠，脸上要有光',
            },
          ],
        },
      ],
    },
  ]

  // 参考片占位：真实照片由 build-shots 脚本注入（见 window.__SHOT_REFS__）
  var REF_IMAGES = window.__SHOT_REFS__ || {}

  // ═══════════════════════ 假响应 ═══════════════════════

  function textOf(content) {
    if (typeof content === 'string') return content
    if (Array.isArray(content) && content[0] && typeof content[0].text === 'string') return content[0].text
    return ''
  }

  /** OpenAI 兼容的 SSE 响应；分块吐出，模拟真实的流式节奏 */
  function sseResponse(text) {
    var enc = new TextEncoder()
    var frames = []
    for (var i = 0; i < text.length; i += 9) {
      frames.push('data: ' + JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 9) } }] }) + '\n\n')
    }
    frames.push('data: [DONE]\n\n')
    var stream = new ReadableStream({
      start: function (c) {
        frames.forEach(function (f) {
          c.enqueue(enc.encode(f))
        })
        c.close()
      },
    })
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })
  }

  function jsonResponse(obj) {
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  function pending() {
    return new Promise(function () {})
  }

  var expandSeq = 0

  /*
   * 三类 JSON 请求用的是同一个 SYSTEM，只能靠 user 提示词的独有句子区分。
   * 别提「拍摄约定」——cards 和 expand 都会嵌入共识，那句话里带着「拍摄约定」，
   * 拿它当特征会把 cards 请求误判成归纳请求（踩过）。
   */
  function handleChat(init) {
    var body = JSON.parse(init.body)
    var messages = body.messages || []
    var last = messages[messages.length - 1]
    var userText = textOf(last && last.content)

    // 讨论：带 stream 的走 SSE。messages 只有 system+user 说明是开场
    if (body.stream) {
      return Promise.resolve(sseResponse(messages.length <= 2 ? DISCUSS_OPENING : DISCUSS_REPLY))
    }

    // 展开单套方案（"请展开为一份完整策划"；cards 里那句是"展开成"，不会撞）
    if (userText.indexOf('展开为一份完整策划') >= 0) {
      var idx = expandSeq++
      if (SHOT === '4') return pending() // 生成中：卡在这一步不返回
      return Promise.resolve(jsonResponse(PLANS[idx % PLANS.length]))
    }

    // 解析前置条件 + 出 3 个场景方向
    if (userText.indexOf('再生成 3 个差异明显的') >= 0) {
      return Promise.resolve(jsonResponse(CARDS))
    }

    // 剩下的就是归纳约定
    return Promise.resolve(jsonResponse(CONSENSUS))
  }

  // 参考片单独计数：不能复用 expandSeq，批量出图时会串位
  var imageSeq = 0

  /*
   * 方案 1 的 5 个画面依次配哪张演示图。
   * 三张图风格统一（西湖 · 情侣 · 日系），但内容不同，乱配会露馅
   * （"坐在草地上"配一张"并肩走路"的图），所以按画面内容挑。
   */
  var REF_BY_SHOT = ['r0', 'r2', 'r0', 'r2', 'r0']

  function handleImage() {
    var key = REF_BY_SHOT[imageSeq++ % REF_BY_SHOT.length]
    var src = REF_IMAGES[key] || ''
    // generateImage 会把 b64_json 直接拼成 dataURL，所以这里只要纯 base64
    var b64 = src.replace(/^data:image\/\w+;base64,/, '')
    return Promise.resolve(
      new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }

  var realFetch = window.fetch.bind(window)
  window.fetch = function (url, init) {
    var u = String(url)
    try {
      if (u.indexOf('/chat/completions') >= 0 && init && init.body) return handleChat(init)
      if (u.indexOf('/images/generations') >= 0) return handleImage()
    } catch (e) {
      /* 落到真实请求 */
    }
    return realFetch(url, init)
  }

  // ═══════════════════════ 驱动 ═══════════════════════

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms)
    })
  }

  function all(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel))
  }

  function byText(t) {
    return all('button, label').filter(function (el) {
      return el.textContent.trim().indexOf(t) >= 0
    })[0]
  }

  function byPlaceholder(t) {
    return all('textarea, input').filter(function (el) {
      return (el.placeholder || '').indexOf(t) >= 0
    })[0]
  }

  function click(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  }

  function type(el, value) {
    var proto =
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  /**
   * 等条件成立。
   *
   * 用 MutationObserver 而不是定时轮询：截图跑在 `--virtual-time-budget` 下，
   * 虚拟时钟会把 setTimeout 快进，轮询几百次是"一瞬间"的事，
   * 而图片解码、canvas 压缩这些真实异步操作根本还没做完 —— 轮询会白等。
   * MutationObserver 走微任务，不受虚拟时钟影响。
   */
  function waitFor(fn, tries) {
    return new Promise(function (resolve, reject) {
      var r = fn()
      if (r) return resolve(r)
      var settled = false
      var obs = new MutationObserver(function () {
        var x = fn()
        if (x && !settled) {
          settled = true
          obs.disconnect()
          resolve(x)
        }
      })
      obs.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      })
      setTimeout(function () {
        if (settled) return
        settled = true
        obs.disconnect()
        reject(new Error('timeout'))
      }, (tries || 100) * 40)
    })
  }

  /** 等到对话区里出现 n 条气泡 */
  function waitBubbles(n) {
    return waitFor(function () {
      return document.querySelectorAll('.whitespace-pre-wrap').length >= n
    })
  }

  async function run() {
    // 等 React 挂载
    await waitFor(function () {
      return document.body.innerText.indexOf('出片助手') >= 0
    })
    await sleep(120)

    if (SHOT === '1') {
      var box = byPlaceholder('想怎么拍都可以')
      if (box) type(box, BRIEF_TEXT)
      await sleep(200)
      return
    }

    // 后续剧本都要先提交前置条件
    var box2 = byPlaceholder('想怎么拍都可以')
    if (box2) {
      type(box2, BRIEF_TEXT)
      await sleep(120)
    }
    var start = byText('开始聊拍摄思路')
    if (!start) throw new Error('找不到「开始聊拍摄思路」')
    click(start)

    if (SHOT === '2') {
      await waitBubbles(1)
      await sleep(150)
      var dbox = byPlaceholder('接着说')
      if (dbox) {
        type(dbox, USER_MSG)
        await sleep(120)
        var send = byText('发送')
        if (send) click(send)
      }
      await waitBubbles(3)
      await sleep(250)
      return
    }

    // 3 / 4 / 5 都要先归纳出约定
    await waitBubbles(1)
    await sleep(150)
    var sum = await waitFor(function () {
      return byText('整理成拍摄约定')
    })
    click(sum)
    var gen = await waitFor(function () {
      return byText('就按这个生成')
    })

    if (SHOT === '3') {
      await sleep(300)
      return
    }

    click(gen)

    if (SHOT === '4') {
      // 停在「正在生成 3 套完整方案」那一屏
      await waitFor(function () {
        return document.body.innerText.indexOf('正在生成') >= 0
      })
      await sleep(400)
      return
    }

    // shot 5：等方案出来，再把整套参考片点出来
    await waitFor(function () {
      return byText('生成全套参考片')
    })
    await sleep(300)

    if (Object.keys(REF_IMAGES).length > 0) {
      click(byText('生成全套参考片'))
      // 5 张图是串行生成的，等它们都挂进 DOM 再收工
      await waitFor(function () {
        return document.querySelectorAll('img[alt="参考片"]').length >= 5
      }, 600)
    }
    await sleep(300)
  }

  // 供截图脚本读取：跑完了就打个标，方便排查
  run().then(
    function () {
      document.documentElement.setAttribute('data-shot-ready', '1')
    },
    function (e) {
      document.documentElement.setAttribute('data-shot-ready', 'err')
      var pre = document.createElement('pre')
      pre.id = 'driver-error'
      pre.style.cssText = 'color:#b91c1c;font:12px monospace;padding:8px'
      pre.textContent = 'DRIVER ERROR: ' + e.message
      document.body.appendChild(pre)
    },
  )
})()
