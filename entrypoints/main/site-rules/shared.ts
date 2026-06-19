// 调试相关
const isDev = process.env.NODE_ENV === 'development';

export const DEFAULT_SELECT_STYLE = "-webkit-line-clamp: unset; max-height: none; height: auto;";

/**
 * 调试日志函数，只在开发模式下输出
 * @param type 日志类型
 * @param message 日志消息
 * @param ...args 日志参数
 */
export function debugLog(type: string, message: string, ...args: any[]): void {
  if (!isDev) return;

  // 为不同类型设置不同颜色
  const colors: {[key: string]: string} = {
    'Twitter': 'color: #1DA1F2; font-weight: bold',
    'GitHub': 'color: #6e5494; font-weight: bold',
    'StackOverflow': 'color: #f48024; font-weight: bold',
    'Reddit': 'color: #FF4500; font-weight: bold',
    'Medium': 'color: #00ab6c; font-weight: bold',
    'YouTube': 'color: #FF0000; font-weight: bold',  // 添加YouTube的颜色
    'Compat': 'color: #0366d6; font-weight: bold',
    'Skip': 'color: #d73a49; font-weight: bold',
    'Content': 'color: #28a745; font-weight: bold',
    'Default': 'color: #24292e; font-weight: bold'
  };
  
  const color = colors[type] || colors['Default'];
  const prefix = `%c[bilingual translate][${type}]`;
  
  // 根据日志类型决定是否需要分组
  if (['Content', 'Skip', 'YouTube', 'GitHub', 'Twitter'].includes(type) && args.length > 0) {
    // 使用折叠分组，减少日志视觉干扰
    console.groupCollapsed(prefix, color, message);
    args.forEach((arg, index) => {
      if (typeof arg === 'string') {
        console.log(`参数${index + 1}:`, arg.substring(0, 100) + (arg.length > 100 ? '...' : ''));
      } else {
        console.log(`参数${index + 1}:`, arg);
      }
    });
    console.groupEnd();
  } else {
    // 常规日志输出
    console.log(prefix, color, message, ...args);
  }
}

/**
 * 检查文本内容是否属于不应翻译的特殊内容
 * 比如：URLs、邮箱地址、用户名、代码片段等
 */
export function isSpecialContent(text: string): boolean {
    if (!text) return false;
    
    const trimmedText = text.trim();
    
    // 检查是否为URL
    if (/^https?:\/\/\S+/i.test(trimmedText)) return true;
    
    // 检查是否为邮箱地址
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedText)) return true;
    
    // 检查是否为社交媒体用户名格式
    if (/^@\w+$/.test(trimmedText)) return true;      // Twitter格式：@username
    if (/^u\/\w+$/.test(trimmedText)) return true;    // Reddit格式：u/username
    
    // 检查是否为x.com或twitter.com的ID格式
    if (/^id@https?:\/\/(x\.com|twitter\.com)\/[\w-]+\/status\/\d+/.test(trimmedText)) return true;
    
    // 检查是否为GitHub相关特殊内容
    // GitHub Issue或PR编号
    if (/^#\d+$/.test(trimmedText)) return true;
    // GitHub仓库引用 user/repo#123
    if (/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+#\d+$/.test(trimmedText)) return true;
    // GitHub 文件路径
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/(blob|tree)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-\/]+$/.test(trimmedText)) return true;
    // GitHub提交哈希
    if (/^[a-f0-9]{7,40}$/.test(trimmedText)) return true;
    // 以.开头的文件名
    if (/^\.[a-zA-Z0-9_.-]+$/.test(trimmedText)) return true;
    // 以通过文件后缀结尾的
    if (/^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9_.-]+$/.test(trimmedText)) return true;

    // 检查是否为代码片段（简单判断，可能会有误判）
    if (/^[a-zA-Z0-9_]+\([^)]*\)/.test(trimmedText)) return true;  // 函数调用
    if (/^import\s+|^from\s+|^require\(/.test(trimmedText)) return true;  // 导入语句
    if (/^const\s+|^let\s+|^var\s+|^function\s+/.test(trimmedText)) return true;  // 变量/函数声明
    
    // 检查是否为哈希值或其他特殊标识符
    if (/^[a-f0-9]{8,}$/i.test(trimmedText)) return true;
    
    return false;
}
