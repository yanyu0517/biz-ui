/**
 * @ignore
 */
define(function(require) {
    var util = require('ui/util');
    require('dep/jquery.resizableColumns');
    require('dep/jquery.editabletable');

    /**
     * Table constructor
     *
     * <iframe width="100%" height="350" src="//jsfiddle.net/bizdevfe/q4myap58/35/embedded/result,js,html/" frameborder="0"></iframe>
     * @constructor
     * @param {HTMLElement|jQuery} table 目标元素
     * @param {Object}         options 参数
     * @param {String}         [options.skin] 皮肤类名
     * @param {Array}          options.column 列配置
     * @param {String}         options.column.field 表头字段名
     * @param {String}         options.column.title 表头文字
     * @param {Function|Array} options.column.content 单元格内容(拆分单元格内容: hover失效, editable失效)
     * @param {Function}       [options.column.footContent] 总计行内容
     * @param {Boolean}        [options.column.escapeTitle] 转义表头文字, 默认true
     * @param {Boolean}        [options.column.escapeContent] 转义单元格内容, 默认true
     * @param {Boolean}        [options.column.sortable] 是否排序, 默认false
     * @param {String}         [options.column.currentSort] des-降序, asc-升序, sortable为true时生效
     * @param {Boolean}        [options.column.editable] 是否编辑, 默认false
     * @param {Number}         options.column.width 最小宽度
     * @param {Number}         [options.column.align] left-居左, right-居中, center-居右
     * @param {Boolean}        [options.column.visible] 是否显示, 默认true
     * @param {Array}          options.data 数据
     * @param {String}         [options.noDataContent] 无数据时显示的内容, 不转义
     * @param {String}         [options.foot] 总计行, top-顶部, bottom-底部
     * @param {Boolean}        [options.selectable] 是否含勾选列
     * @param {Boolean}        [options.resizable] 是否可调整列宽
     * @param {Function}       [options.onSort] 排序回调, onSort(data, event)
     * @param {Function}       [options.onSelect] 勾选回调, onSelect(data, event)
     * @param {Function}       [options.onEdit] 编辑单元格回调, onEdit(data, event)
     * @param {Function}       [options.onValidate] 验证回调, onValidate(data, event)
     * @param {Boolean}        [options.lockHead] 是否开启表头锁定
     * @param {Number}         [options.topOffset] 表头锁定时，表头上方预留高度
     */
    function Table(table, options) {
        if (table instanceof jQuery) {
            if (table.length > 0) {
                table = table[0]; //只取第一个元素
            } else {
                return;
            }
        }

        if (!isTable(table)) {
            return;
        }

        /**
         * @property {HTMLElement} main `table`元素
         */
        this.main = table;

        /**
         * @property {jQuery} $main `table`元素的$包装
         */
        this.$main = $(this.main);

        var defaultOption = {
            data: [],
            selectable: false,
            resizable: false,
            topOffset: 0,
            lockHead: false
        };
        this.defaultClass = 'biz-table';
        this.rowIdPrefix = 'biz-table-row-' + Math.floor((Math.random() * (10000 - 0 + 1) + 0)) + '-';
        this.selectPrefix = 'biz-table-select-row-' + Math.floor((Math.random() * (10000 - 0 + 1) + 0)) + '-';
        this.options = $.extend(true, defaultOption, options || {});
        this.init(this.options);
    }

    Table.prototype = {
        /**
         * 初始化
         * @param {Object} [options] 参数
         * @protected
         */
        init: function(options) {
            this.$main.html(
                '<div class="biz-table-head-wrap"><table class="biz-table-head"></table></div>' +
                '<div class="biz-table-placeholder"></div>' +
                '<div class="biz-table-body-wrap"><table class="biz-table-body"></table></div>'
            );

            this.$headWrap = this.$main.find('.biz-table-head-wrap');
            this.$bodyWrap = this.$main.find('.biz-table-body-wrap');
            this.$placeholder = this.$main.find('.biz-table-placeholder');
            this.$tableHead = this.$main.find('.biz-table-head');
            this.$tableBody = this.$main.find('.biz-table-body');

            var skin = options.skin ? (' ' + options.skin) : '';

            //保存下初始化时候的排序
            //如果有多个排序列，那么默认排序取最后一个
            this.defaultSort = [];
            for (var i = options.column.length - 1; i >= 0; i--) {
                var col = options.column[i];
                if (col.currentSort) {
                    this.defaultSort[this.defaultSort.length] = {
                        field: col.field,
                        currentSort: col.currentSort
                    };
                }
            }

            //创建表头
            this.$tableHead.html(this.createTableHead(options))
                .addClass(this.defaultClass + skin);

            //创建表格
            this.$tableBody.html(this.createTableBody(options))
                .addClass(this.defaultClass + skin + (this.rowSpan > 1 ? ' biz-rowspan' : ''));

            //勾选列
            if (options.selectable) {
                this.createSelect();
                this.bindSelect();
            }

            if (options.data.length) { //总计行
                if (options.foot === 'top') {
                    this.$tableBody.find('tbody').prepend(this.createFoot(options));
                }
                if (options.foot === 'bottom') {
                    this.$tableBody.find('tbody').append(this.createFoot(options));
                }
            } else if (options.noDataContent) { //无数据提示行
                this.createNoDataContent();
            }

            //同步宽度
            this.syncWidth();
            $(window).on('resize.bizTable', function() {
                self.syncWidth();
            });

            //绑定横向滚动
            var self = this;
            this.$headWrap.on('scroll', function() {
                self.$bodyWrap[0].scrollLeft = this.scrollLeft;
            });
            this.$bodyWrap.on('scroll', function() {
                self.$headWrap[0].scrollLeft = this.scrollLeft;
            });

            if (options.lockHead) {
                var headHeight = this.$headWrap.height();

                //表头跟随
                $(window).on('scroll.bizTable', function() {
                    //此处要实时计算表头位置，防止表头位置动态发生变化
                    var currentOffsetTop = self.$main.offset().top - options.topOffset;
                    if ($(window).scrollTop() > currentOffsetTop) {
                        if (!self.hasLocked) {
                            self.$headWrap.css({
                                position: 'fixed',
                                top: self.options.topOffset,
                                width: self.$main.width()
                            });
                            self.$placeholder.css({
                                height: headHeight + self.options.topOffset
                            });
                            self.hasLocked = true;
                        }
                    } else {
                        if (self.hasLocked) {
                            self.$headWrap.css({
                                position: 'static',
                                top: 'auto',
                                width: 'auto'
                            });
                            self.$placeholder.css({
                                height: 0
                            });
                            self.hasLocked = false;
                        }
                    }
                });
            }

            //调整列宽
            if (options.resizable) {
                this.setMinWidth();
                this.$tableHead.resizableColumns({
                    start: function() {
                        $('.biz-table-editor').blur();
                    }
                });
            }

            //排序
            if (options.onSort) {
                this.bindSort();
            }

            //编辑单元格
            this.$tableBody.editableTableWidget();
            if (options.onEdit) {
                this.bindEdit();
            }
            if (options.onValidate) {
                this.bindValidate();
            }
        },

        /**
         * 同步宽度
         * @protected
         */
        syncWidth: function() {
            this.$headWrap.css({
                width: this.$main.width()
            });
            this.$tableHead.css({
                width: this.$tableBody.width()
            });
        },

        /**
         * 设置表格最小宽度
         * @protected
         */
        setMinWidth: function() {
            var width = $.map(this.options.column, function(col, index) {
                if (typeof col.visible !== 'undefined' && !col.visible) {
                    return 0;
                }
                return col.width + 17;
            });
            var minWidth = this.options.selectable ? 37 : 0;
            $.each(width, function(index, val) {
                minWidth = minWidth + val;
            });
            this.$tableHead.css('min-width', minWidth);
            this.$tableBody.css('min-width', minWidth);
            this.syncWidth();
        },

        /**
         * 创建表头
         * @param {Object} options
         * @return {String}
         * @protected
         */
        createTableHead: function(options) {
            var table = ['<thead><tr>'],
                column = options.column,
                columnCount = column.length;

            this.rowSpan = 1;

            //表头
            for (var i = 0; i < columnCount; i++) {
                var col = column[i];
                if (typeof col.visible !== 'undefined' && !col.visible) {
                    continue;
                }

                if (!util.isArray(col.content)) {
                    col.content = [col.content];
                }
                if (col.content.length > this.rowSpan) {
                    this.rowSpan = col.content.length;
                }

                var title = (typeof col.escapeTitle === 'undefined' || col.escapeTitle) ? util.escapeHTML(col.title) : col.title,
                    sortTable = false;
                if (typeof col.sortable !== 'undefined' && col.sortable) {
                    var sort = (col.sortable && typeof col.currentSort !== 'undefined') ? (' ' + col.currentSort) : '';
                    title = '<div class="sortable"' + sort + '>' + title + '</div>';
                    sortTable = true;
                }

                var width = col.width ? ' width="' + col.width + '"' : '';
                table.push('<th nowrap data-width="' + col.width + '"' + width + (sortTable ? ' sortable' : '') + ' field="' + col.field + '">' + title + '</th>');
            }

            table.push('</tr></thead><tbody></tbody>');

            return table.join('');
        },

        /**
         * 创建表格
         * @param {Object} options
         * @return {String}
         * @protected
         */
        createTableBody: function(options) {
            var table = ['<tbody>'],
                column = options.column,
                columnCount = column.length,
                data = options.data,
                rowCount = data.length;

            //数据
            for (var j = 0; j < rowCount; j++) {
                table.push('<tr id="' + this.rowIdPrefix + (j + 1) + '">');

                for (var k = 0; k < columnCount; k++) {
                    var col = column[k];
                    if (typeof col.visible !== 'undefined' && !col.visible) {
                        continue;
                    }
                    var editable = (col.content.length > 1 || typeof col.editable === 'undefined' || !col.editable) ? '' : ' editable',
                        align = col.align ? ' align="' + col.align + '"' : '',
                        width = col.width ? ' width="' + (editable !== '' ? col.width - 22 : col.width) + '"' : '',
                        rowSpan = (this.rowSpan > 1 && col.content.length === 1) ? (' rowspan="' + this.rowSpan + '"') : '',
                        content = col.content[0].apply(this, [data[j], j + 1, col.field]) + '',
                        escapeContent = (typeof col.escapeContent === 'undefined' || col.escapeContent) ? util.escapeHTML(content) : content;
                    table.push('<td' + width + rowSpan + editable + align + '>' + escapeContent + '</td>');
                }

                table.push('</tr>');

                //附加行
                if (this.rowSpan > 1) {
                    for (var m = 1; m < this.rowSpan; m++) {
                        table.push('<tr id="' + this.rowIdPrefix + (j + 1) + '">');
                        for (var n = 1; n < columnCount; n++) {
                            var _col = column[n];
                            if ((typeof _col.visible !== 'undefined' && !_col.visible) || _col.content.length === 1) {
                                continue;
                            }
                            var _align = _col.align ? ' align="' + _col.align + '"' : '',
                                _content = _col.content[m].apply(this, [data[j], j + 1, _col.field]) + '',
                                _escapeContent = (typeof _col.escapeContent === 'undefined' || _col.escapeContent) ? util.escapeHTML(_content) : _content;
                            table.push('<td' + _align + '>' + _escapeContent + '</td>');
                        }
                        table.push('</tr>');
                    }
                }
            }

            table.push('</tbody>');

            return table.join('');
        },

        /**
         * 创建总计行
         * @param {Object} options
         * @return {String}
         * @protected
         */
        createFoot: function(options) {
            var sum = ['<tr class="sum">'],
                column = options.column,
                columnCount = column.length;

            if (options.selectable) {
                sum.push('<td width="20"></td>');
            }
            for (var i = 0; i < columnCount; i++) {
                var col = column[i];
                if (typeof col.visible !== 'undefined' && !col.visible) {
                    continue;
                }
                var align = col.align ? ' align="' + col.align + '"' : '',
                    width = col.width ? ' width="' + col.width + '"' : '',
                    content = col.footContent ? col.footContent.call(this, col.field) + '' : '',
                    escapeContent = (typeof col.escapeContent === 'undefined' || col.escapeContent) ? util.escapeHTML(content) : content;
                sum.push('<td' + width + align + '>' + escapeContent + '</td>');
            }

            sum.push('</tr>');

            return sum.join('');
        },

        /**
         * 创建无数据提示行
         * @protected
         */
        createNoDataContent: function() {
            var colspan = this.options.column.length;
            $.each(this.options.column, function(index, val) {
                if (typeof val.visible !== 'undefined' && !val.visible) {
                    colspan = colspan - 1;
                }
            });
            if (this.options.selectable) {
                colspan = colspan + 1;
            }
            this.$tableBody.find('tbody').append('<tr class="no-data"><td colspan="' + colspan + '">' + this.options.noDataContent + '</td></tr>');
        },

        /**
         * 创建Checkbox控件
         * @protected
         */
        createSelect: function() {
            this.$tableHead.find('tr').prepend('<th nowrap data-width="20" width="20"><input type="checkbox" title=" " id="' + (this.selectPrefix + 0) + '" /></th>');
            var self = this;
            if (this.rowSpan === 1) {
                this.$tableBody.find('tr').each(function(index, tr) {
                    $(tr).prepend('<td width="20" align="center"><input type="checkbox" title=" " id="' + (self.selectPrefix + (index + 1)) + '" /></td>');
                });
            } else {
                var rowIndex = 1;
                this.$tableBody.find('tr').each(function(index, tr) {
                    if ((index + self.rowSpan) % self.rowSpan === 0) {
                        $(tr).prepend('<td width="20" align="center" rowspan="' + self.rowSpan + '"><input type="checkbox" title=" " id="' + (self.selectPrefix + rowIndex) + '" /></td>');
                        rowIndex = rowIndex + 1;
                    }
                });
            }

            this.$main.find(':checkbox').bizCheckbox();
        },

        /**
         * 创建Checkbox控件
         * @protected
         */
        bindSelect: function() {
            var self = this;
            this.$main.on('click.bizTableSelectAll', '.biz-table-head th .biz-label', function(e) {
                var selected = $(e.target).hasClass('biz-checkbox-checked'),
                    checkbox = self.$tableBody.find(':checkbox'),
                    tr = self.$tableBody.find('tr[class!="sum"]');
                if (selected) {
                    checkbox.bizCheckbox('check');
                    tr.addClass('selected');
                    if (self.options.onSelect) {
                        self.options.onSelect.call(self, self.options.data, e);
                    }
                } else {
                    checkbox.bizCheckbox('uncheck');
                    tr.removeClass('selected');
                    if (self.options.onSelect) {
                        self.options.onSelect.call(self, [], e);
                    }
                }
            }).on('click.bizTableSelectOne', '.biz-table-body td .biz-label', function(e) {
                var selected = $(e.target).hasClass('biz-checkbox-checked'),
                    selectedCount = self.$tableBody.find('.biz-checkbox-checked').length,
                    selectAll = self.$tableHead.find(':checkbox'),
                    tr = $(e.target).parent().parent(),
                    rowCount = self.options.data.length;
                if (selectedCount === rowCount) {
                    selectAll.bizCheckbox('check');
                } else {
                    selectAll.bizCheckbox('uncheck');
                }
                if (selected) {
                    tr.addClass('selected');
                } else {
                    tr.removeClass('selected');
                }
                if (self.options.onSelect) {
                    self.options.onSelect.call(self, $.map(self.getSelectedIndex(), function(item, index) {
                        return self.options.data[item];
                    }), e);
                }
            });
        },

        /**
         * 获取勾选行序号
         * @return {Array}
         * @protected
         */
        getSelectedIndex: function() {
            var self = this;
            return $.map(this.$tableBody.find('.biz-checkbox-checked'), function(label, index) {
                return parseInt($(label).attr('for').replace(self.selectPrefix, ''), 10) - 1;
            });
        },

        /**
         * 绑定排序事件
         * @protected
         */
        bindSort: function() {
            var self = this;
            this.$main.on('click.bizTableSort', '.biz-table-head div.sortable', function(e) {
                var head = $(e.currentTarget),
                    field = head.parent().attr('field');
                if (head.attr('des') !== undefined) {
                    head.removeAttr('des').attr('asc', '');
                } else if (head.attr('asc') !== undefined) {
                    head.removeAttr('asc').attr('des', '');
                } else {
                    head.parents().filter('tr:first').find('div.sortable').removeAttr('des').removeAttr('asc');
                    head.attr('des', '');
                }
                $.each(self.options.column, function(index, val) {
                    if (val.field === field) {
                        val.currentSort = head.attr('des') !== undefined ? 'des' : 'asc';
                    } else if (val.currentSort) {
                        delete val.currentSort;
                    }
                });
                self.options.onSort.call(self, {
                    field: head.parent().attr('field'),
                    des: head.attr('des') !== undefined,
                    asc: head.attr('asc') !== undefined
                }, e);
            });
        },

        /**
         * 恢复列表初始化时候默认排序的样式
         * 注意：只更新数据状态，不会重绘，需要手动触发refresh()重新渲染
         */
        resetSort: function() {
            var i, col;
            if (this.defaultSort.length) {
                for (i = 0; i < this.options.column.length; i++) {
                    col = this.options.column[i];
                    //首先删除掉currentSort
                    //之后如果在之前纪录的默认排序中有，则重新谁currentSort
                    delete col.currentSort;
                    for (var j = 0; j < this.defaultSort.length; j++) {
                        if (col.field == this.defaultSort[j].field) {
                            col.currentSort = this.defaultSort[j].currentSort;
                        }
                    }
                }
            } else {
                //如果没有默认排序，说明在初始化的时候所有的列没有传currentSort参数
                //那么则删除列表中所有列的currentSort
                for (i = 0; i < this.options.column.length; i++) {
                    col = this.options.column[i];
                    if (col.currentSort) {
                        delete col.currentSort;
                    }
                }
            }
        },

        /**
         * 绑定验证事件
         * @protected
         */
        bindValidate: function() {
            var self = this;
            this.$main.find('td[editable]').on('validate', function(e, newValue) {
                var columIndex = $(this).parent().find('td').index($(this));
                if (self.options.selectable) {
                    columIndex = columIndex - 1;
                }
                return self.options.onValidate.call(self, {
                    newValue: newValue,
                    field: self.options.column[columIndex].field
                }, e);
            });
        },

        /**
         * 绑定编辑事件
         * @protected
         */
        bindEdit: function() {
            var self = this;
            this.$main.find('td[editable]').on('change', function(e, newValue) {
                var rowIndex = parseInt($(this).parent().attr('id').replace(self.rowIdPrefix, ''), 10),
                    columIndex = $(this).parent().find('td').index($(this));
                if (self.options.selectable) {
                    columIndex = columIndex - 1;
                }
                var field = self.options.column[columIndex].field;

                //更新data
                self.options.data[rowIndex - 1][field] = newValue;

                self.options.onEdit.call(self, {
                    newValue: newValue,
                    item: self.options.data[rowIndex - 1],
                    index: rowIndex,
                    field: field
                }, e);
            });
        },

        /**
         * 获取列表数据
         * @return {Array}
         */
        getData: function() {
            return this.options.data;
        },

        /**
         * 更新列表数据
         * @param {Array} data
         */
        updateData: function(data) {
            this.options.data = $.map(data || [], function(val, index) {
                return val;
            });
            this.refresh();
        },

        /**
         * 更新列数据
         * @param {Number} rowIndex 行号
         * @param {Object} data 行数据
         */
        updateRow: function(rowIndex, data) {
            this.options.data[rowIndex - 1] = $.extend(true, {}, data);
            this.refresh();
        },

        /**
         * 更新单元格数据
         * @param {Number} rowIndex 行号
         * @param {String} field 列字段
         * @param {Mixed} data 单元格数据
         */
        updateCell: function(rowIndex, field, data) {
            this.options.data[rowIndex - 1][field] = data;
            this.refresh();
        },

        /**
         * 获取勾选行数据
         * @return {Array}
         */
        getSelected: function() {
            var self = this;
            return $.map(this.getSelectedIndex(), function(item, index) {
                return self.options.data[item];
            });
        },

        /**
         * 设置勾选状态
         * @param {Number|Array} rowIndex 行号, 0表示全部
         * @param {Boolean} selected 勾选状态
         */
        setSelected: function(rowIndex, selected) {
            var self = this;
            if (rowIndex === 0) {
                rowIndex = $.map(this.options.data, function(val, index) {
                    return index + 1;
                });
            }
            if (!util.isArray(rowIndex)) {
                rowIndex = [rowIndex];
            }

            $.each(rowIndex, function(index, val) {
                var checkbox = self.$main.find('#' + self.selectPrefix + val),
                    tr = checkbox.parent().parent();
                if (selected) {
                    checkbox.bizCheckbox('check');
                    tr.addClass('selected');
                } else {
                    checkbox.bizCheckbox('uncheck');
                    tr.removeClass('selected');
                }
            });

            var checkAll = this.$tableHead.find(':checkbox');
            if (this.$tableBody.find('.biz-checkbox-checked').length === this.options.data.length) {
                checkAll.bizCheckbox('check');
            } else {
                checkAll.bizCheckbox('uncheck');
            }
        },

        /**
         * 显示列
         * @param {String|Array} field 列字段
         */
        showColumn: function(field) {
            this.setColumnVisible(field, true);
        },

        /**
         * 隐藏列
         * @param {String|Array} field 列字段
         */
        hideColumn: function(field) {
            this.setColumnVisible(field, false);
        },

        /**
         * 设置列显隐
         * @param {String|Array} field 列字段
         * @param {Boolean} visible 列字段
         * @protected
         */
        setColumnVisible: function(field, visible) {
            if (!util.isArray(field)) {
                field = [field];
            }
            var self = this;
            $.each(field, function(i, f) {
                $.each(self.options.column, function(j, col) {
                    if (col.field === f) {
                        col.visible = visible;
                    }
                });
            });
            this.refresh();
        },

        /**
         * 根据当前参数重绘表格
         */
        refresh: function() {
            //销毁
            this.$main.find(':checkbox').bizCheckbox('destroy');
            this.$tableBody.find('td[editable]').off();

            //重绘表格
            this.$tableHead.html(this.createTableHead(this.options));
            this.$tableBody.html(this.createTableBody(this.options));

            //重建checkbox
            if (this.options.selectable) {
                this.createSelect();
            }

            if (this.options.data.length) { //重绘总计行
                if (this.options.foot === 'top') {
                    this.$tableBody.find('tbody').prepend(this.createFoot(this.options));
                }
                if (this.options.foot === 'bottom') {
                    this.$tableBody.find('tbody').append(this.createFoot(this.options));
                }
            } else if (this.options.noDataContent) { //重绘无数据提示行
                this.createNoDataContent();
            }

            //同步宽度
            this.syncWidth();

            //重置滚条位置
            this.$headWrap[0].scrollLeft = this.$bodyWrap[0].scrollLeft = 0;

            //重置列宽
            if (this.options.resizable) {
                this.setMinWidth();
                this.$tableHead.resizableColumns('destroy').resizableColumns({
                    start: function() {
                        $('.biz-table-editor').blur();
                    }
                });
            }

            //重置编辑
            this.$tableBody.find('td').prop('tabindex', 1);
            if (this.options.onEdit) {
                this.bindEdit();
            }
            if (this.options.onValidate) {
                this.bindValidate();
            }
        },

        /**
         * 销毁
         */
        destroy: function() {
            this.$main.find(':checkbox').bizCheckbox('destroy');
            this.$tableBody.find('td[editable]').off();
            $('.biz-table-editor').off().remove();

            this.$main.off('click.bizTableSelectAll')
                .off('click.bizTableSelectOne')
                .off('click.bizTableSort');

            if (this.options.resizable) {
                this.$tableHead.resizableColumns('destroy');
            }

            $(window).off('scroll.bizTable');

            this.$headWrap.off();
            this.$bodyWrap.off();

            this.$main.empty();
        }
    };

    function isTable(elem) {
        return elem.nodeType === 1 && elem.tagName.toLowerCase() === 'div';
    }

    var dataKey = 'bizTable';

    $.extend($.fn, {
        bizTable: function(method, options) {
            var table;
            switch (method) {
                case 'getData':
                    return this.data(dataKey).getData();
                case 'updateData':
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.updateData(options);
                        }
                    });
                    break;
                case 'updateRow':
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.updateRow(args[1], args[2]);
                        }
                    });
                    break;
                case 'updateCell':
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.updateCell(args[1], args[2], args[3]);
                        }
                    });
                    break;
                case 'getSelected':
                    return this.data(dataKey).getSelected();
                case 'setSelected':
                    var args = arguments;
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.setSelected(args[1], args[2]);
                        }
                    });
                    break;
                case 'showColumn':
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.showColumn(options);
                        }
                    });
                    break;
                case 'hideColumn':
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.hideColumn(options);
                        }
                    });
                    break;
                case 'resetSort':
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.resetSort(options);
                        }
                    });
                    break;
                case 'destroy':
                    this.each(function() {
                        table = $(this).data(dataKey);
                        if (table) {
                            table.destroy();
                            $(this).data(dataKey, null);
                        }
                    });
                    break;
                default:
                    this.each(function() {
                        if (!$(this).data(dataKey) && isTable(this)) {
                            $(this).data(dataKey, new Table(this, method));
                        }
                    });
            }

            return this;
        }
    });

    return Table;
});