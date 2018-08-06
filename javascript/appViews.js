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
    className: 'col-md-6',
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
        'click #effectsButton': 'openInteractiveEffects',
        'click #referencesButton': 'openReferenceGroups',
        'submit #calculationForm': 'runCalculation'
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
        this.$el.find('[name="covariatesSelection"]').selectize({
            plugins: ['remove_button'],
            sortField: 'order'
        });
        return this;
    },
    runCalculation: function (e) {
        this.$('#run').prop("disabled", true);
        appMixture.models.results.clear();
        e.preventDefault();
        var $that = this,
            params = _.extend({}, this.model.attributes);
        var formData = new FormData();
        if (params.covariatesSelection) {
            params.covariatesSelection = params.covariatesSelection.split(',');
        } else {
            params.covariatesSelection = [];
        }
        formData.append('csvFile', params.csvFile);
        delete params.csvFile;
        formData.append('jsonData', JSON.stringify(params));
        appMixture.models.results.fetch({
            data: formData,
            cache: false,
            contentType: false,
            processData: false,
            type: "POST",
            success: function(model, res, options) {
                $that.$('#run').prop("disabled", false);
            },
            error: function(model, res, options) {
                console.log(res.responseText);
                $that.$('#run').prop("disabled", false);
                $that.$('#error-message').html(res.responseText)
            }
        });
    },
    resetModel: function(e) {
        this.model.clear();
        this.updateOptions();
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
                'covariatesArr': this.model.get('covariatesArr'),
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
                    $that.model.set({
                        'csvFile': e.target.files[0],
                        'headers': headers.sort(),
                        'uniqueValues': uniqueValues
                    });
                }
            };

            if (file) {
                reader.readAsText(file.slice());
            } else {
                $that.model.set({
                    'csvFile': null,
                    'headers': null
                });
            }
        }
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
        } else {
            model.set('covariatesArr', []);
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
    changeEffectsList: function () {
        var model = this.model
        var effects = appMixture.models.form.attributes.effects;
        var effects_String = "";
        counter = 1
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
            'change:covariatesArr': this.updateView
        }, this);
        this.render();
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
            } else if (value === 'nominal') {
            } else {
                covariateObj.category = '';
            }
        }
        model.trigger('change:covariatesArr', model);
    },
    updateView: function() {
        var model = this.model,
            covariatesArr = model.get('covariatesArr'),
            $that = this;
        covariatesArr.forEach(function(entry) {
            var name = entry.text,
                type = entry.type,
                category = entry.category;
                eType = $that.$el.find('[name="'+name+'_type"]'),
                eCatText = $that.$el.find('[id="'+name+'_category_text"]');
                eCatSelect = $that.$el.find('[id="'+name+'_category_select"]');
            if (type != eType.val()) {
                eType.find('option[value="'+type+'"]').prop('selected',true);
            }
            if (category != eCatText.val()) {
                eCatText.val(category);
            }
            if (type === 'continuous') {
                eCatText.prop('hidden', false);
                eCatSelect.prop('hidden', true);
            } else if (type === 'nominal') {
                eCatText.prop('hidden', true);
                eCatSelect.prop('hidden', false);
            } else {
                eCatText.val('');
                eCatSelect.val('');
                eCatText.prop('hidden', false);
                eCatSelect.prop('hidden', true);
            }
        });
    },
    render: function() {
        this.$modal = BootstrapDialog.show({
            buttons: [{
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
    }
});

appMixture.ResultsView = Backbone.View.extend({
    tagName: 'div',
    className: 'col-md-6',
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
        'click #reset': 'resetForm',
        'submit #predictionForm':'onSubmitPredict',
        'click #timePointRange': 'changeTimePointType',
        'click #timePointList': 'changeTimePointType',
        'click #uploadTD': 'changeTestDataType',
        'click #enterTD': 'changeTestDataType',
        'click #enterTestData': 'showEnterTestDataView'
    },
    initialize: function () {
        var testDataModel = new appMixture.TestDataModel({
            // name filed should be valid for HTML id (without spaces and special characters
            'covariatesArr': [
                {   name: "RES_HPV16",
                    value: null
                }]
        });
        this.model.set('testDataModel', testDataModel, {silent: true});
        this.template = _.template(appMixture.templates.get('prediction'), {
            'variable': 'data'
        });
        this.model.on({
            'change': this.render
        }, this);
    },
    render: function () {
        this.$el.html(this.template(this.model.attributes));
        return this;
    },
    resetForm: function(e) {
        this.$('#timePointsRangeGroup').prop('hidden', false);
        this.$('#timePointsListGroup').prop('hidden', true);
        this.$('#timePointsListGroup').val("");
    },
    onSubmitPredict: function (e) {
        e.preventDefault();
        this.$('#runPredict').prop('disabled', true);
        var $that = this;
        var formData = new FormData();
        var jsonData = {};

        var serverFile = this.$('[name="serverFile"]').val();
        if (serverFile) {
            jsonData["serverFile"] = serverFile;
        } else if (this.$('[name="rdsFile"]')[0].files.length > 0) {
            formData.append('rdsFile', this.$('[name="rdsFile"]')[0].files[0]);
        } else {
            // TODO: display error when no files provided
        }

        if (this.$('[name="testDataFile"]')[0].files.length > 0) {
            formData.append('testDataFile', this.$('[name="testDataFile"]')[0].files[0]);
        } else {
            jsonData.testData = this.model.get('testDataModel').get('testData');
        }

        var timePoints = this.$('[name="timePoints"]').val();
        if (timePoints) {
            jsonData.timePoints = timePoints.split(',');
        } else {
            jsonData["begin"] = this.$('[name="begin"]').val();
            jsonData["end"] = this.$('[name="end"]').val();
            jsonData["stepSize"] = this.$('[name="stepSize"]').val();
        }
        formData.append('jsonData', JSON.stringify(jsonData));

        this.model.unset('error', {silent: true});
        this.model.unset('results', {silent: true});
        this.model.trigger('change');
        this.model.fetch({
            data: formData,
            cache: false,
            contentType: false,
            processData: false,
            type: "POST",
            success: function(model, res, options) {
                $that.$('#runPredict').prop('disabled', false);
            },
            error: function(model, res, options) {
                console.log(res.responseJSON);
                $that.$('#runPredict').prop('disabled', false);
                $that.model.set('error', res.responseText);
            }
        });
    },
    changeTimePointType: function(e) {
        if (e.target.id === "timePointRange") {
            this.$('#timePointsRangeGroup').prop('hidden', false);
            this.$('#timePointsRangeGroup input').prop('required', true);
            this.$('#timePointsListGroup').prop('hidden', true);
            this.$('#timePointsListGroup input').prop('required', false);
            this.$('#timePoints').val('');
        } else if (e.target.id === "timePointList") {
            this.$('#timePointsListGroup').prop('hidden', false);
            this.$('#timePointsListGroup input').prop('required', true);
            this.$('#timePointsRangeGroup').prop('hidden', true);
            this.$('#timePointsRangeGroup input').prop('required', false);
        }
    },
    changeTestDataType: function(e) {
        if (e.target.id === "uploadTD") {
            this.$('#testDataUpload').prop('hidden', false);
            this.$('#testDataFile').prop('required', true);
            this.$('#testDataEnter').prop('hidden', true);
        } else if (e.target.id === "enterTD") {
            this.$('#testDataEnter').prop('hidden', false);
            this.$('#testDataUpload').prop('hidden', true);
            this.$('#testDataFile').prop('required', false);
            this.$('#testDataFile').val('');
            this.showEnterTestDataView();
        }
    },
    showEnterTestDataView: function(e) {
        if (e) {
            e.preventDefault();
        }
        new appMixture.TestDataView({
            model: this.model.get('testDataModel')
        });
    }
});

appMixture.TestDataView = Backbone.View.extend({
    initialize: function () {
        this.template = _.template(appMixture.templates.get('testData'));
        this.showModal();
        this.model.on('change:tempTestData', this.render, this);
    },
    events: {
        'click #saveTestData': 'save',
        'click #cancelTestData': 'cancel',
        'click #addTestData': 'addTestDataRow',
        'input input': 'updateAddButtonStatus',
        'click .deleteTestDataButton': 'removeTestDataRow'
    },
    showModal: function() {
        this.$modal = BootstrapDialog.show({
            buttons: [{
                id: 'saveTestData',
                cssClass: 'btn-primary save',
                label: 'Save'
            }, {
                id: 'cancelTestData',
                cssClass: 'btn-primary',
                label: 'Cancel'
            }],
            message: $(this.template(this.model.attributes)),
            title: "Edit Test Data"
        });
        this.setElement(this.$modal.getModal());
        this.updateSaveButtonStatus();
    },
    render: function() {
        this.$('.bootstrap-dialog-message').html(this.template(this.model.attributes));
        this.updateSaveButtonStatus();
    },
    addTestDataRow: function(e) {
        e.preventDefault();
        console.log("Update model");
        var tempTestData = this.model.get('tempTestData');
        var row = {};
        for (var model of this.model.get('covariatesArr')) {
            row[model.name] = parseFloat(this.$('#' + model.name + '_value').val());
            this.$('#' + model.name + '_value').val("");
        }
        tempTestData.push(row);
        this.model.trigger('change:tempTestData');
    },
    removeTestDataRow: function(e) {
        e.preventDefault();
        var index = parseInt(e.target.dataset.index);
        this.model.get('tempTestData').splice(index, 1);
        this.model.trigger('change:tempTestData');
    },
    updateSaveButtonStatus: function() {
        var testData = this.model.get('testData');
        var tempTestData = this.model.get('tempTestData');
        var diff1 = _.difference(testData, tempTestData);
        var diff2 = _.difference(tempTestData, testData);
        if( diff1.length > 0 || diff2.length > 0) {
            this.$('#saveTestData').prop('disabled', false);
        } else {
            this.$('#saveTestData').prop('disabled', true);
        }
    },
    updateAddButtonStatus: function(e) {
        if ($(e.target).val().length > 0) {
            this.$('#addTestData').prop('disabled', false);
        } else {
            this.$('#addTestData').prop('disabled', true);
        }
    },
    save: function(e) {
        e.preventDefault();
        console.log("Save test data");
        this.model.set('testData', this.model.get('tempTestData').slice(0));
        this.$modal.close();
    },
    cancel: function(e) {
        e.preventDefault();
        this.model.set('tempTestData', this.model.get('testData').slice(0));
        this.$modal.close();
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
