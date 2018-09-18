var appMixture = {
    events: {
        updateModel: function (e) {
            var e = $(e.target);
            if (e.attr('type') == 'checkbox') {
                this.model.set(e.attr('name') || e.attr('id'), e.prop('checked'));
            } else {
                this.model.set(e.attr('name') || e.attr('id'), !e.hasClass('selectized') ? e.val() : e.val().length > 0 ? e.val().split(',') : []);
            }
        }
    },
    models: {},
    views: {},
    variables: [
        'outcomeC',
        'outcomeL',
        'outcomeR'
    ],
    MAX_PAGES: 5,
    currentView: null,
    showView: function(view) {
        if (this.currentView !== null && this.currentView.cid !== view.cid) {
            this.currentView.$el.html("");
        }
        this.currentView = view;
        return view.render();
    }
};

appMixture.FormView = Backbone.View.extend({
    tagName: 'div',
    className: 'col-md-4',
    id: 'input',
    initialize: function () {
        this.template = _.template(appMixture.templates.get('form'), {
            'variable': 'data'
        });
        var $that = this;
        this.model.on({
            'change:headers': this.updateOptions,
            'change:design': this.changeDesign,
            'change:model': this.changeModel,
            'change:outcomeC': this.changeCovariates,
            'change:outcomeL': this.changeCovariates,
            'change:outcomeR': this.changeCovariates,
            'change:covariatesSelection': this.changeCovariateList,
            'change:covariatesArrValid': this.changeCovariatesArr,
            'change:effects': this.changeEffectsList,
            'change:email': this.changeEmail
        }, this);
    },
    events: {
        'click #reset': 'resetModel',
        'change input[type="file"]': 'uploadFile',
        'change input.selectized': 'updateModel',
        'change input[type="text"]': 'updateModel',
        'keyup input[type="text"]': 'updateModel',
        'change input[type="checkbox"]': 'updateModel',
        'change select': 'updateModel',
        'change [name="sendToQueue"]': 'changeQueueStatus',
        'click #effectsButton': 'openInteractiveEffects',
        'click #referencesButton': 'openReferenceGroups',
        'submit #calculationForm': 'runCalculation'
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
        return this;
    },
    runCalculation: function (e) {
        e.preventDefault();
        if (!this.model.get('isMutuallyExclusive')) {
            return;
        }
        if (!this.model.get('covariatesArrValid')) {
            this.$('#covariates-error').html('Please set covariate reference levels before submitting');
            return;
        }
        this.$('#run').prop("disabled", true);
        appMixture.models.results.clear().set(appMixture.models.results.defaults);
        var $that = this,
            params = _.extend({}, this.model.attributes);
        var formData = new FormData();
        if (params.covariatesSelection) {
            params.covariatesSelection = params.covariatesSelection.split(',');
            if (params.effects && params.effects.length > 0) {
                var effects = [];
                for (var effect of this.model.get('effects')) {
                    effects.push([effect.first, effect.second])
                }
                params.effects = effects;
            }
        } else {
            params.covariatesSelection = [];
        }
        formData.append('csvFile', params.csvFile);
        delete params.csvFile;
        formData.append('jsonData', JSON.stringify(params));
        this.startSpinner();
        $that.$('#error-message').html('');
        appMixture.models.results.fetch({
            data: formData,
            cache: false,
            contentType: false,
            processData: false,
            type: "POST",
            success: function(model, res, options) {
                $that.$('#run').prop("disabled", false);
                $that.stopSpinner();
            },
            error: function(model, res, options) {
                console.log(res.responseText);
                $that.$('#run').prop("disabled", false);
                $that.stopSpinner();
                $that.$('#error-message').html(res.responseText);
            }
        });
    },
    startSpinner: function() {
        var target = this.$('#indicator')[0];
        if (this.spinner) {
            this.spinner.spin(target);
        } else {
            var opts = {
                lines: 13, // The number of lines to draw
                length: 27, // The length of each line
                width: 11, // The line thickness
                radius: 20, // The radius of the inner circle
                scale: 0.25, // Scales overall size of the spinner
                corners: 1, // Corner roundness (0..1)
                color: '#ffffff', // CSS color or array of colors
                fadeColor: 'transparent', // CSS color or array of colors
                speed: 0.8, // Rounds per second
                rotate: 0, // The rotation offset
                animation: 'spinner-line-fade-more', // The CSS animation name for the lines
                direction: 1, // 1: clockwise, -1: counterclockwise
                zIndex: 2e9, // The z-index (defaults to 2000000000)
                className: 'spinner', // The CSS class to assign to the spinner
                top: '50%', // Top position relative to parent
                left: '50%', // Left position relative to parent
                shadow: '0 0 1px transparent', // Box-shadow for the lines
                position: 'absolute' // Element positioning
            };
            this.spinner = new Spinner(opts).spin(target);
        }
    },
    stopSpinner: function() {
        this.spinner.stop();
    },
    resetModel: function(e) {
        this.model.clear().set(this.model.defaults);
        appMixture.models.results.clear().set(appMixture.models.results.defaults);
        this.render();
    },
    openInteractiveEffects: function (e) {
        e.preventDefault();
        new appMixture.InteractiveEffectsView({
            model: new appMixture.EffectsModel({
                'formModel': this.model,
                'covariatesSelection': this.model.get('covariatesSelection'),
                'effects': this.model.get('effects').slice()
            })
        });
    },
    openReferenceGroups: function (e) {
        e.preventDefault();
        new appMixture.ReferenceGroupsView({
            model: new appMixture.ReferencesModel({
                'covariatesArr': this.model.get('covariatesArr').map(function(cov) {
                    return _.extend({}, cov);
                }),
                'uniqueValues': this.model.get('uniqueValues'),
                'formModel': this.model,
                'references': _.extend({}, this.model.get('references'))
            })
        });
    },
    uploadFile: function (e) {
        const MAX_UNIQUE_VALUES = 20;
        e.preventDefault();
        var $that = this;
        if (window.FileReader) {
            var file = e.target.files[0],
                reader = new window.FileReader(),
                content = "",
                block = "";
            reader.onload = function(evt) {
                var lines = $.csv.toArrays(evt.target.result);
                if (lines && lines.length > 0) {
                    var headers = lines[0];
                    var uniqueValues = {};
                    for (var j = 0; j < headers.length; ++j) {
                        uniqueValues[headers[j]] = new Set();
                    }
                    for (var i = 1; i < lines.length; ++i) {
                        for (var j = 0; j < headers.length; ++j) {
                            if (uniqueValues[headers[j]].size < MAX_UNIQUE_VALUES) {
                                uniqueValues[headers[j]].add(lines[i][j]);
                            }
                        }
                    }
                    $that.enableInputs();
                    $that.$('[name="covariatesSelection"]').selectize({
                        plugins: ['remove_button'],
                        sortField: 'order'
                    });

                    $that.model.set({
                        'csvFile': e.target.files[0],
                        'headers': headers.sort(),
                        'uniqueValues': uniqueValues
                    });
                }
            };

            if (file) {
                reader.readAsText(file.slice());
                this.$('#csvFileName').html(file.name);
            } else {
                $that.model.set({
                    'csvFile': null,
                    'headers': null
                });
            }
        }
    },
    enableInputs: function() {
        this.$('[name="design"], [name="model"], [name="outcomeC"], [name="outcomeL"], '
            + '[name="outcomeR"], [name="covariatesSelection"], [name="sendToQueue"], '
            + '#run, #reset'
        ).prop('disabled', false);
        this.$('#csvFileBtn').prop('disabled', true);
    },
    updateModel: function (e) {
        e.preventDefault();
        var e = $(e.target),
            name = e.prop('name'),
            val = e.val();
        if (name.length < 1) return;
        switch (e.prop('type')) {
            case 'checkbox':
                val = e.prop('checked') || false;
                break;
            default:
                if (val === "null") val = null;;
                if (!Number.isNaN(parseInt(val))) val = parseInt(val);
                break;
        }

        this.model.set(name, val);
        this.updateOptions();

        if (appMixture.variables.indexOf(name) != -1) {
            this.checkMutuallyExclusive();
        }
    },
    checkMutuallyExclusive: function() {
        this.model.set('isMutuallyExclusive', true);
        this.$('#mutex-error').html('');
        for (var name of appMixture.variables) {
            this.$('#' + name).removeClass('has-error');
        }

        for (var i = 0; i < appMixture.variables.length; ++i) {
            var name1 = appMixture.variables[i];
            var val1 = this.model.get(name1);
            if (val1) {
                for (var j = i + 1; j < appMixture.variables.length; ++j) {
                    var name2 = appMixture.variables[j];
                    var val2 = this.model.get(name2);
                    if (val2 && val1 === val2) {
                        this.$('#' + name1).addClass('has-error');
                        this.$('#' + name2).addClass('has-error');
                        this.model.set('isMutuallyExclusive', false);
                        this.$('#mutex-error').html('Please make sure C, L and R are mutually exclusive!');
                    }
                }
            }
        }
    },
    changeQueueStatus: function(e) {
        this.$('[name="email"]').prop('disabled', !$(e.target).prop('checked'));
        //TODO: change queue status
    },
    changeCovariateList: function () {
        var model = this.model,
            covariatesSelection = this.model.get('covariatesSelection');
        if (covariatesSelection && covariatesSelection.split(',').length > 1) {
            model.set('effects', []);
        } else {
            if (model.get('effects')) {
                model.set('effects', model.get('effects').filter(function (entry) {
                    return covariatesSelection.indexOf(entry.first) > -1 && covariatesSelection.indexOf(entry.second) > -1;
                }));
            }

            if (model.get('references')) {
                model.set('references', model.get('references').filter(function (entry) {
                    for (var index in entry) {
                        if (covariatesSelection.indexOf(entry[index]) < 0) {
                            return false;
                        }
                    }
                    return true;
                }));
            }
        }
        this.changeCovariates.apply(this);
    },
    changeCovariates: function () {
        var model = this.model,
            covariatesSelection = model.get('covariatesSelection');

        this.updateSelectize.apply(this);
        var covariatesSelectionSplit = [];
        if (covariatesSelection && covariatesSelection !== "") {
            covariatesSelectionSplit = covariatesSelection.split(',');
            var covariatesArrNew = [];
            var covariatesArr = model.get('covariatesArr');

            _.each(covariatesSelectionSplit, function (covariate) {
                var item = _.find(covariatesArr, function (covariateObj) {
                    return covariateObj.text === covariate;
                });
                if (item) {
                    covariatesArrNew.push(item);
                } else {
                    covariatesArrNew.push({
                        text: covariate,
                        type: '',
                        category: ''
                    });
                }
            });
            model.set('covariatesArr', covariatesArrNew);
            model.set('covariatesArrValid', false);
        } else {
            model.set('covariatesArr', []);
            model.set('covariatesArrValid', true);
            this.$('#covariates-error').html('');
        }

        if (covariatesSelectionSplit.length > 1) {
            this.$el.find('#effectsButton').prop("disabled", false);
            this.$el.find('#referencesButton').prop("disabled", false);
        } else {
            this.$el.find('#effectsButton').prop("disabled", true);
            if (covariatesSelectionSplit.length === 0) {
                this.$el.find('#referencesButton').prop("disabled", true);
            } else {
                this.$el.find('#referencesButton').prop("disabled", false);
            }
        }
    },
    changeCovariatesArr: function() {
        this.$('#covariates-error').html('');
    },
    changeEffectsList: function () {
        return; // Don't display current interactive effects in form
        var model = this.model;
        var effects = appMixture.models.form.attributes.effects;
        var effects_String = "";
        counter = 1;
        _.each(effects, function (val, attribute) {
            if (counter <= 5)
                effects_String += "<p>" + val.first + " &nbsp " + val.second + "</p>";
            counter++;
        });
        $("#effects").html(effects_String);
    },
    changeDesign: function () {
        this.$el.find('[name="model"] option:last-child').prop('disabled',(this.model.get('design') === 1));
        if (this.model.get('design') === "") {
        } else {
            var modelSelect = this.$el.find('[name="model"]')[0];
            if ($(modelSelect.options[modelSelect.selectedIndex]).attr('disabled') !== undefined) {
                modelSelect.selectedIndex = 0;
                this.model.set('model','');
            }
        }
    },
    changeEmail: function () {
        if (this.model.get('email') === "") {
        } else {
        }
    },
    changeModel: function () {
        if (this.model.get('model') === "") {
        } else {
        }
    },
    resetGroup: function () {
        this.model.set('groupValue', []);
    },
    updateOptions: function () {
        var headers = this.model.get('headers');
        if (headers) {
        } else {
            for (var i = 0; i < appMixture.variables.length; ++i) {
                this.$el.find('[name="' + appMixture.variables[i] + '"]').html('');
            }
            var covariatesSelection = this.$el.find('[name="covariatesSelection"]')[0].selectize;
            covariatesSelection.clearOptions();
            return;
        }
        if (headers === null) return;
        var selected = [];
        var covariatesSelection = this.$el.find('[name="covariatesSelection"]')[0].selectize;
        for (var i = 0; i < appMixture.variables.length; ++i) {
            var value = this.model.get(appMixture.variables[i]);
            var optionsList = this.getOptionTags(headers, [], value);
            this.$el.find('[name="' + appMixture.variables[i] + '"]').html(optionsList);
            if (value) {
                selected.push(value);
                covariatesSelection.removeOption(value); 
            }  
        }

        for (var opt of _.difference(headers, selected)) {
            covariatesSelection.addOption({'text': opt, 'value': opt});
        }
    },
    getOptionTags: function(options, selected, current) {
        var optionsList = "<option value=\"\">----Select Outcome----</option>";
        for (var index = 0; index < options.length; index++) {
            if (selected.indexOf(options[index]) === -1) {
                optionsList += '<option value="' + options[index] + '"';
                if (options[index] === current) {
                    optionsList += ' selected ';
                }
                optionsList += '>' + options[index] + '</option>';
            }
        }
        return optionsList;
    },
    updateSelectize: function() {
        var covariatesSelection = this.$el.find('[name="covariatesSelection"]')[0].selectize;
        var selected = [];
        for (var i = 0; i < appMixture.variables.length; ++i) {
            var value = this.model.get(appMixture.variables[i]);
            if (value) {
                selected.push(value);
                covariatesSelection.removeOption(value); 
            }  
        }
        var headers = this.model.get('headers');
        options = _.difference(headers, selected).map(function (e) {
            return {
                'text': e,
                'value': e
            };
        });
        covariatesSelection.addOption(options);
    }
});

appMixture.InteractiveEffectsView = Backbone.View.extend({
    initialize: function () {
        this.template = _.template(appMixture.templates.get('effects'));
        this.model.on({
            'change:effects': this.rerenderFooter,
            'change:first': this.rerenderSelects,
            'change:second': this.rerenderSelects
        }, this);
        this.render();
    },
    events: {
        'hidden.bs.modal': 'remove',
        'change select': 'updateModel',
        'click #add-effects': 'addEffect',
        'click .remove-effects': 'removeEffect',
        'click .modal-footer button.save': 'save',
        'click .modal-footer button:not(.save)': 'close'
    },
    addEffect: function (e) {
        var model = this.model,
            first = model.get('first'),
            second = model.get('second'),
            effects = model.get('effects');
        effects.push({
            'first': first < second ? first : second,
            'second': first < second ? second : first
        });
        model.set({
            'first': '',
            'second': ''
        });
        model.trigger('change:effects', model);
    },
    close: function (e) {
        e.preventDefault(e);
        this.$modal.close();
    },
    removeEffect: function (e) {
        var e = $(e.target)
        model = this.model,
            effects = model.get('effects');
        effects.splice(e.prop('data-index'), 1);
        model.trigger('change:effects', model);
    },
    save: function (e) {
        e.preventDefault(e);
        this.model.get('formModel').set('effects', this.model.get('effects'));
        this.close.call(this, e);
    },
    updateModel: appMixture.events.updateModel,
    render: function () {
        this.$modal = BootstrapDialog.show({
            buttons: [{
                cssClass: 'btn-primary save',
                label: 'Save'
            }, {
                cssClass: 'btn-primary',
                label: 'Close'
            }],
            message: $(this.template(this.model.attributes)),
            title: "Enter Interactive Effects"
        });
        this.setElement(this.$modal.getModal());
        this.rerenderSelects.apply(this);
        this.rerenderFooter.apply(this);
    },
    rerenderSelects: function () {
        var model = this.model,
            effects = model.get('effects'),
            first = model.get('first'),
            second = model.get('second'),
            firstList = model.get('covariatesSelection').split(',').filter(function (entry) {
                return entry !== second;
            }),
            secondList = model.get('covariatesSelection').split(',').filter(function (entry) {
                return entry !== first;
            }),
            eF = this.$el.find('[name="first"]'),
            eS = this.$el.find('[name="second"]'),
            selectedIndex = 0;
        eF.empty().append($('<option>', {
            text: "---Select Covariate---",
            value: ""
        }));
        firstList.forEach(function (entry, index) {
            if (entry === first) selectedIndex = index + 1;
            eF.append($('<option>', {
                text: entry,
                value: entry
            }));
        });
        eF[0].selectedIndex = selectedIndex;
        selectedIndex = 0;
        eS.empty().append($('<option>', {
            text: "---Select Covariate---",
            value: ""
        }));
        secondList.forEach(function (entry, index) {
            if (entry === second) selectedIndex = index + 1;
            eS.append($('<option>', {
                text: entry,
                value: entry
            }));
        });
        eS[0].selectedIndex = selectedIndex;
        first = this.model.get('first');
        second = this.model.get('second');
        var alreadyInserted = effects.length > 0 ? effects.filter(function (entry) {
            return entry.first == (first < second ? first : second) && entry.second == (first < second ? second : first);
        }).length > 0 : false;
        if (first === '' || second === '' || alreadyInserted) {
            this.$('#add-effects').prop('disabled', true);
        } else {
            this.$('#add-effects').prop('disabled', false);
        }
    },
    rerenderFooter: function () {
        this.$el.find('tfoot').empty().append(_.template(appMixture.templates.get('effectsFooter'))(this.model.attributes));
    }
});

appMixture.ReferenceGroupsView = Backbone.View.extend({
    initialize: function () {
        this.template = _.template(appMixture.templates.get('references'));
        this.model.on({
            'change:covariatesArr': this.render
        }, this);
        this.showModal();
    },
    events: {
        'hidden.bs.modal': 'remove',
        'change select': 'updateModel',
        'change input[type="text"]': 'updateModel',
        'click .modal-footer button.save': 'save',
        'click .modal-footer button:not(.save)': 'close'
    },
    close: function(e) {
        e.preventDefault(e);
        this.$modal.close();
    },
    save: function(e) {
        e.preventDefault(e);
        this.model.get('formModel').set('covariatesArr', this.model.get('covariatesArr'));
        this.model.get('formModel').set('covariatesArrValid', true);
        this.close.call(this, e);
    },
    updateModel: function(e) {
        var model = this.model,
            input = $(e.target),
            covariatesArr = model.get('covariatesArr'),
            name = (input.attr('name') || input.attr('id')).split('_'),
            value = input.val(),
            type = name.splice(name.length-1,1)[0];
        name = name.join('_');

        var covariateObj = _.find(covariatesArr, function (obj) {
            return obj.text === name;
        });
        covariateObj[type] = input.val();
        if (type === 'type') {
            if (value === 'continuous') {
                covariateObj.category = '0';
            } else {
                covariateObj.category = '';
            }
        }
        this.validate();
        model.trigger('change:covariatesArr', model);
    },
    validate: function() {
        var properties = ['text', 'type', 'category'];
        this.model.set('valid', true);
        for (var cov of this.model.get('covariatesArr')) {
            for (var prop of properties) {
                if (!cov[prop]) {
                    this.model.set('valid', false);
                    break;
                }
            }
        }
        this.$('#saveCovariatesBtn').prop('disabled', !this.model.get('valid'));
    },
    render: function() {
        this.$('.bootstrap-dialog-message').html($(this.template(this.model.attributes)));
    },
    showModal: function() {
        this.$modal = BootstrapDialog.show({
            buttons: [{
                id: 'saveCovariatesBtn',
                cssClass: 'btn-primary save',
                label: 'Save'
            }, {
                cssClass: 'btn-primary',
                label: 'Cancel'
            }],
            message: $(this.template(this.model.attributes)),
            title: "Configure Covariates"
        });
        this.setElement(this.$modal.getModal());
        this.validate();
    }
});

appMixture.ResultsView = Backbone.View.extend({
    tagName: 'div',
    className: 'col-md-8',
    id: 'output',
    initialize: function () {
        this.model.on({
            'change': this.render
        }, this);
        this.template = _.template(appMixture.templates.get('results'), {
            'variable': 'data'
        });
    },
    render: function () {
        this.$el.html(this.template(this.model.attributes));
        return this;
    }
});

appMixture.PredictionView = Backbone.View.extend({
    el: '#prediction-tool',
    events: {
        'input #rdsFile': 'selectModelFile',
        'input #testDataFile': 'selectTestDataFile',
        'click #reset': 'resetForm',
        'submit #predictionForm':'onSubmitPredict',
        'click #timePointRange': 'changeTimePointType',
        'click #timePointList': 'changeTimePointType'
    },
    initialize: function () {
        this.template = _.template(appMixture.templates.get('prediction'), {
            'variable': 'data'
        });

        this.model.on({
            'change:results': this.render
        }, this);

        appMixture.predictionResultModel = new appMixture.PredictionResultModel();
    },
    render: function () {
        this.$el.html(this.template(this.model.attributes));
        appMixture.predictionResultView = new appMixture.PredictionResultView({model: appMixture.predictionResultModel});
        this.$el.append(appMixture.predictionResultView.render().el);
        return this;
    },
    selectModelFile: function(e) {
        var file = e.target.files[0];
        if (file) {
            this.$('#modelFileName').html(file.name);
            this.$('#modelFileBtn').prop('disabled', true);
            this.tryEnableInputs();
        }
    },
    selectTestDataFile: function(e) {
        var file = e.target.files[0];
        if (file) {
            this.$('#testDataFileName').html(file.name);
            this.$('#testDataFileBtn').prop('disabled', true);
            this.tryEnableInputs();
        }
    },
    tryEnableInputs: function() {
        var modelFileSelected = this.model.get('serverFile');
        if (!modelFileSelected) {
            modelFileSelected = this.$('#rdsFile')[0].files[0];
        }
        var testDataFileSelected = this.$('#testDataFile')[0].files[0];
        if (modelFileSelected || testDataFileSelected) {
            this.$('#reset').prop('disabled', false);
        }
        if (modelFileSelected && testDataFileSelected) {
            this.$('#timePointsWell').prop('disabled', false);
            this.$('#runPredict').prop('disabled', false);
        }
    },
    resetForm: function(e) {
        appMixture.predictionResultModel.clear().set(appMixture.predictionResultModel.defaults);
        if (this.model.get('serverFile')) {
            this.model.unset('serverFile');
            return appMixture.router.navigate('#prediction', true);
        }
        this.$('#modelFileBtn').prop('disabled', false);
        this.$('#testDataFileBtn').prop('disabled', false);
        this.$('#timePointsRangeGroup').prop('hidden', false);
        this.$('#timePointsListGroup').prop('hidden', true);
        this.$('#timePointList').prop('checked', false);
        this.$('#timePointRange').prop('checked', true);
        this.$('#rdsFile').val('');
        this.$('#testDataFile').val('');
        this.$('#begin').val('');
        this.$('#end').val('');
        this.$('#stepSize').val('');
        this.$('#timePoints').val('');
        this.$('#modelFileName').html("");
        this.$('#testDataFileName').html("");
        this.$('#timePointsWell').prop('disabled', true);
        this.$('#runPredict').prop('disabled', true);
        this.$('#reset').prop('disabled', true);
    },
    onSubmitPredict: function (e) {
        e.preventDefault();
        var $that = this;
        var formData = new FormData();
        var jsonData = {};

        var serverFile = this.$('[name="serverFile"]').val() || this.model.get('serverFile');
        if (serverFile) {
            jsonData["serverFile"] = serverFile;
        } else if (this.$('[name="rdsFile"]')[0].files.length > 0) {
            formData.append('rdsFile', this.$('[name="rdsFile"]')[0].files[0]);
        } else {
            this.$('#error-message').html('Please choose a valid model file!');
            return;
        }

        formData.append('testDataFile', this.$('[name="testDataFile"]')[0].files[0]);

        if (this.model.get('timePointType') === 'List') {
            jsonData.timePoints = this.$('[name="timePoints"]').val().split(',');
        } else {
            jsonData["begin"] = this.$('[name="begin"]').val();
            jsonData["end"] = this.$('[name="end"]').val();
            jsonData["stepSize"] = this.$('[name="stepSize"]').val();
        }
        formData.append('jsonData', JSON.stringify(jsonData));

        this.$('#error-message').html('');
        appMixture.predictionResultModel.clear().set(appMixture.predictionResultModel.defaults);
        this.$('#runPredict').prop('disabled', true);
        this.startSpinner();
        appMixture.predictionResultModel.fetch({
            data: formData,
            cache: false,
            contentType: false,
            processData: false,
            type: "POST",
            success: function(model, res, options) {
                $that.$('#runPredict').prop('disabled', false);
                $that.stopSpinner();
            },
            error: function(model, res, options) {
                $that.$('#runPredict').prop('disabled', false);
                $that.stopSpinner();
                if (res.status == 410) { // rds file on server doesn't exist anymore
                    var redirect = confirm("Model file on server doesn't exist anymore!\nUpload a new model file?");
                    if (redirect) {
                        console.log("Redirect");
                        appMixture.router.navigate('#prediction', true);
                        return;
                    } else {
                        console.log("Stay");
                    }
                }
                $that.$('#error-message').html(res.responseText);
            }
        });
    },
    changeTimePointType: function(e) {
        if (e.target.id === "timePointRange") {
            this.model.set('timePointType', 'Range');
            this.$('#timePointsRangeGroup').prop('hidden', false);
            this.$('#timePointsRangeGroup input').prop('required', true);
            this.$('#timePointsListGroup').prop('hidden', true);
            this.$('#timePointsListGroup input').prop('required', false);
        } else if (e.target.id === "timePointList") {
            this.model.set('timePointType', 'List');
            this.$('#timePointsListGroup').prop('hidden', false);
            this.$('#timePointsListGroup input').prop('required', true);
            this.$('#timePointsRangeGroup').prop('hidden', true);
            this.$('#timePointsRangeGroup input').prop('required', false);
        }
    },
    startSpinner: function() {
        var target = this.$('#indicator')[0];
        if (this.spinner) {
            this.spinner.spin(target);
        } else {
            var opts = {
                lines: 13, // The number of lines to draw
                length: 27, // The length of each line
                width: 11, // The line thickness
                radius: 20, // The radius of the inner circle
                scale: 0.25, // Scales overall size of the spinner
                corners: 1, // Corner roundness (0..1)
                color: '#ffffff', // CSS color or array of colors
                fadeColor: 'transparent', // CSS color or array of colors
                speed: 0.8, // Rounds per second
                rotate: 0, // The rotation offset
                animation: 'spinner-line-fade-more', // The CSS animation name for the lines
                direction: 1, // 1: clockwise, -1: counterclockwise
                zIndex: 2e9, // The z-index (defaults to 2000000000)
                className: 'spinner', // The CSS class to assign to the spinner
                top: '50%', // Top position relative to parent
                left: '50%', // Left position relative to parent
                shadow: '0 0 1px transparent', // Box-shadow for the lines
                position: 'absolute' // Element positioning
            };
            this.spinner = new Spinner(opts).spin(target);
        }
    },
    stopSpinner: function() {
        this.spinner.stop();
    }
});

appMixture.PredictionResultView = Backbone.View.extend({
    tagName: 'div',
    id: 'results',
    className: 'col-md-8',
    events: {
        'input #pageSize': 'changePageSize',
        'click .pageNav': 'changePage'
    },
    initialize: function() {
        this.template = _.template(appMixture.templates.get('predictionResults'), {
            'variable': 'data'
        });
        this.model.on({
            'change:results change:end change:start': this.render
        }, this);
    },
    changePageSize: function(e) {
        var pageSize = parseInt(e.target.value);
        var resultLength = 0;
        if (this.model.get('results') && this.model.get('results').prediction) {
            resultLength = this.model.get('results').prediction.length;
        }
        var pages = Math.ceil(resultLength / pageSize);
        var pageNum = Math.floor(this.model.get('start') / pageSize) + 1;
        this.model.set('pageSize', pageSize, {silent: true});
        this.model.set('pages', pages, {silent: true});
        this.model.set('pageNum', pageNum, {silent: true});
        this.calculatePageBoundaries();
    },
    changePage: function(e) {
        e.preventDefault();
        var pageNum = parseInt(e.target.dataset.pageNum);
        if (pageNum) {
            this.model.set('pageNum', pageNum, {silent: true});
            this.calculatePageBoundaries();
        }
    },
    calculatePageBoundaries: function() {
        var pageNum = this.model.get('pageNum');
        var pageSize = this.model.get('pageSize');
        var resultLength = 0;
        if (this.model.get('results') && this.model.get('results').prediction) {
            resultLength = this.model.get('results').prediction.length;
        }
        var start = (pageNum -1) * pageSize;
        var end = pageNum * pageSize;
        var end = end > resultLength ? resultLength : end;
        this.model.set('start', start, {silent: true});
        this.model.set('end', end, {silent: true});
        this.model.trigger('change:end', this.model);
    },
    calculateNeighborPages: function() {
        var currentPage = this.model.get('pageNum');
        var start = currentPage - Math.floor(appMixture.MAX_PAGES / 2);
        if (start < 1) {
            start = 1;
        }
        var end = start + appMixture.MAX_PAGES -1;
        if (end > this.model.get('pages')) {
            var emptySpace = end - this.model.get('pages');
            end = this.model.get('pages');
            start -= emptySpace;
            if (start < 1) {
                start = 1;
            }
        }
        var pages = [];
        for (var i = start; i <= end; ++i) {
            pages.push(i);
        }
        this.model.set('neighborPages', pages, {silent: true});
    },
    render: function() {
        this.calculateNeighborPages();
        this.$el.html(this.template(this.model.attributes));
        return this;
    }
});

appMixture.BaseView = Backbone.View.extend({
    el: '#main-tool',
    render: function() {
        appMixture.views.form = new appMixture.FormView({
            model: this.model.get('form')
        });
        appMixture.views.results = new appMixture.ResultsView({
            model: this.model.get('results')
        });
        this.$el.append(appMixture.views.form.render().el);
        this.$el.append(appMixture.views.results.render().el);
        return this;
    }
});

appMixture.Router = Backbone.Router.extend({
    routes: {
        '': 'fitting',
        'prediction(/*rdsFile)': 'prediction'
    },
    prediction: function(rdsFile) {
        $('#prediction-li').addClass('active');
        $('#fitting-li').removeClass('active');
        if (rdsFile) {
            appMixture.models.prediction.set('serverFile', rdsFile);
        } else {
            appMixture.models.prediction.unset('serverFile');
        }
        appMixture.showView(appMixture.views.prediction);
    },
    fitting: function() {
        $('#fitting-li').addClass('active');
        $('#prediction-li').removeClass('active');
        appMixture.showView(appMixture.views.base);
    }
});

$(function () {
    Number.prototype.countDecimals = function () {
        if (Math.floor(this.valueOf()) === this.valueOf()) return 0;
        return this.toString().split(".")[1].length || 0;
    };
    appMixture.router = new appMixture.Router();
    appMixture.templates = new appMixture.TemplatesModel();
    appMixture.templates.fetch().done(function () {
        appMixture.models.form = new appMixture.FormModel();
        appMixture.models.results = new appMixture.ResultsModel();
        appMixture.models.prediction = new appMixture.PredictionModel();
        appMixture.models.base = new appMixture.BaseModel({
            'form': appMixture.models.form,
            'results': appMixture.models.results
        });
        appMixture.views.base = new appMixture.BaseView({
            model: appMixture.models.base
        });
        appMixture.views.prediction = new appMixture.PredictionView({
            model: appMixture.models.prediction
        });
        Backbone.history.start();
    });
});
