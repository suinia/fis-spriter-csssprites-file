'use strict';

const cssParser = require('./libs/cssParser');
const util = require('./libs/util');
let imgGen;
try {
  imgGen = require('./libs/image');
} catch (e) {
  fis.log.warning('csssprites-file does not support your node ' + process.version + ', report it to https://github.com/suinia/fis-spriter-csssprites-file/issues');
}

module.exports = function(ret, conf, settings, opt) {
  if (!imgGen) {
    return;
  }
  // 文件属性中useSprite == true的css做图片合并
  // html文件<style></style>标签内做图片合并
  fis.util.map(ret.src, function(subpath, file) {
    if (file.isCssLike && file.useSprite) {
      const setting = Object.assign({}, settings, file.csssprites || {});
      processCss(file, ret, setting, opt);
    }
    if (file.isHtmlLike && (file.useSprite || settings.htmlUseSprite)) {
      const setting = Object.assign({}, settings, file.csssprites || {});
      processInline(file, ret, setting, opt);
    }
  });

  // 打包后的css文件做图片合并
  fis.util.map(ret.pkg, function(subpath, file) {
    if (file.rExt === '.css') {
      const setting = Object.assign({}, settings, file.csssprites || {});
      processCss(file, ret, setting, opt);
    }
  });
};

function processCss(file, ret, settings, opt) {
  const content = _process(file.getContent(), file, null, ret, settings, opt);
  file.setContent(content);
}

function processInline(file, ret, settings, opt) {
  // 匹配 <style></style> 以及用户自定义标签 setting
  const style_reg = /(<style(?:(?=\s)[\s\S]*?["'\s\w\/\-]>|>))([\s\S]*?)(<\/style\s*>|$)/ig;
  const reg = settings.styleReg ? settings.styleReg : style_reg;
  let content = file.getContent();
  let i = 0;
  content = content.replace(reg, function(m, start_tag, content, end_tag) {
    return start_tag + _process(content, file, i++, ret, settings, opt) + end_tag;
  });
  file.setContent(content);
}

function _processPart(content, file, index, ret, settings, opt) {
  const images = {};
  fis.util.map(ret.src, function(subpath, item) {
    if (item.isImage()) {
      images[ util.getUrl(item, file, opt) ] = item;
    }
  });
  const res = cssParser(content, images);
  content = res.content;
  if (res.map) {
    const css = imgGen(file, index, res.map, images, ret, settings, opt);
    content = content + css;
  }
  return content;
}

const __media_re = /\@media\s*?([^\{]*?)\s*\{((?:[^\}]*?\{[\s\S]*?\})+)[\s\S]*?\}/gi;

function _process(content, file, index, ret, settings, opt) {
  // 将css内容根据'@media'拆分，把每一部分看作一份单独的css处理，最后再经行组合
  // 将同类型media合并处理，解决模块化开发时，多个同类型media中的图片不能合并到一张
  // 但是...可能会有样式覆盖问题...写样式的时候尽量将@media写在页面底部
  let i = 1;
  const media_css = {};
  let css = content.replace(__media_re, function(m, media_flag, media_cont) {
    const flag = media_flag.replace(/[\s\:\(\)\[\]]+/g, '_');
    if (media_css[ flag ]) {
      media_css[ flag ].css.push(media_cont);
    } else {
      media_css[ flag ] = {
        id: i,
        flag: media_flag,
        css: [ media_cont ],
      };
      i++;
    }

    return '';
  });

  // 处理无media样式
  css = _processPart(css, file, index, ret, settings, opt);

  // 将media处理后的内容插入页面最底部，这里可能会有问题...
  // 插回原先位置太复杂了Orz...
  fis.util.map(media_css, function(flag, item) {
    const item_css = '@media ' + item.flag + '{' + _processPart(item.css.join(''), file, (index ? index + '_' + item.id : item.id), ret, settings, opt) + '}';
    css += item_css;
  });

  return css;
}