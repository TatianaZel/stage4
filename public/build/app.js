'use strict';

let app = angular.module('app', ['ui.router', 'ui.router.state.events', 'LocalStorageModule', 'ui.bootstrap'])
        .run(['$rootScope', 'localStorageService',
            ($rootScope, localStorageService) => {
                $rootScope.$on('$stateChangeStart', (event, toState) => {
                    if (toState.data && toState.data.auth) {
                        if (toState.data.auth === 'Anonymous' && localStorageService.cookie.get('token')) {
                            event.preventDefault();
                            return false;
                        }
                        if (toState.data.auth === 'Authorized' && !localStorageService.cookie.get('token')) {
                            event.preventDefault();
                            return false;
                        }
                    }
                });
            }
        ]);

app.factory('memberListService', ['requestService', 'urls',
    (requestService, urls) => {
        var members = [];

        return {
            getMembers: getMembers,
            members: members
        };

        function getMembers() {
            return new Promise((resolve, reject) => {
                requestService.sendRequest(urls.members, 'get').then(getMembersSuccess, getMembersError);

                function getMembersSuccess(res) {
                    if (res.data) {
                        !members.length ? Array.prototype.push.apply(members, res.data) : '';
                        resolve();
                    } else {
                        //errorMessages.gettingPosts = 'No available posts.';
                        reject();
                    }
                }

                function getMembersError(err) {
                    //errorMessages.gettingPosts = response;
                    reject();
                }
            });
        }
    }
]);

app.factory('authService', ['localStorageService', 'requestService', 'urls', 'chatService',
    (localStorageService, requestService, urls, chatService) => {

        var config = {
                headers: {
                    'Content-Type': 'application/jsone;'
                }
            };

        var authData = {
                token: localStorageService.cookie.get('token'),
                email: localStorageService.cookie.get('email'),
                userId: localStorageService.cookie.get('userId')
            },
            reqData = {
                isSendingNow: false
            },
            errorSignInMessages = {},
            errorSignOutMessages = {},
            errorSignUpMessages = {};

        if (authData.token && authData.userId)
            chatService.connect(authData.userId, authData.token);

        return {
            signIn: signIn,
            signUp: signUp,
            signOut: signOut,
            authData: authData,
            reqData: reqData,
            errorSignInMessages: errorSignInMessages,
            errorSignOutMessages: errorSignOutMessages,
            errorSignUpMessages: errorSignUpMessages
        };

        function signIn(sendData, signUpResolve) {
            return new Promise((resolve, reject) => {
                reqData.isSendingNow = true;
                requestService.sendRequest(urls.signIn, 'post', null, sendData, config).then(signInSuccess, signInError);

                function signInSuccess(response) {
                    reqData.isSendingNow = false;
                    if (response.data && response.data.token && response.data.userId) {
                        authData.token = response.data.token;
                        authData.userId = response.data.userId;
                        if (response.config && response.config.data) {
                            authData.email = JSON.parse(response.config.data).email;
                        } else {
                            authData.email = '';
                        }
                        localStorageService.cookie.set('token', authData.token);
                        localStorageService.cookie.set('email', authData.email);
                        localStorageService.cookie.set('userId', authData.userId);
                        errorSignInMessages.signIn = '';
                        signUpResolve ? signUpResolve() : '';

                        chatService.connect(authData.userId, authData.token);

                        resolve();
                    } else {
                        errorSignInMessages.signIn = 'Some error. Please, try sign in again.';
                        reject();
                    }
                }

                function signInError(response) {
                    reqData.isSendingNow = false;
                    errorSignInMessages.signIn = response;
                    reject();
                }
            });
        }

        function signUp(sendData) {
            return new Promise((signUpResolve, reject) => {
                reqData.isSendingNow = true;
                requestService.sendRequest(urls.signUp, 'post', null, sendData, config).then(signUpSuccess, signUpError);

                function signUpSuccess(response) {
                    reqData.isSendingNow = false;
                    if (response.config && response.config.data) {
                        signIn(JSON.parse(response.config.data), signUpResolve);
                        errorSignUpMessages.signUp = '';
                    } else {
                        errorSignUpMessages.signUp = 'Some error. Please, try sign up again.';
                        reject();
                    }
                }

                function signUpError(response) {
                    reqData.isSendingNow = false;
                    errorSignUpMessages.signUp = response;
                    reject();
                }
            });
        }

        function signOut() {
            return new Promise((resolve, reject) => {
                var headers = {
                    'Token': authData.token
                };

                requestService.sendRequest(urls.signOut, 'post', headers).then(signOutSuccess, signOutError);

                function signOutSuccess() {
                    localStorageService.cookie.remove('token');
                    localStorageService.cookie.remove('email');
                    localStorageService.cookie.remove('userId');
                    authData.token = '';
                    authData.email = '';
                    authData.userId = '';
                    resolve();
                }

                function signOutError() {
                    reject();
                }
            });
        }
    }
]);

app.factory('chatService', ['localStorageService',
    (localStorageService) => {
        var chats = [];
        var socket;

        return {
            connect: connect,
            beginChat: beginChat,
            addUserToChat: addUserToChat,
            getChatsWithUser: getChatsWithUser,
            sendMessage: sendMessage,
            chats: chats
        };

        function connect() {
            socket = io.connect({
                query: {
                    token: localStorageService.cookie.get('token')
                }
            });

            socket.on('successConnection', (data) => {
                Array.prototype.push.apply(chats, data.chats);

                socket.on('messageForClient', (data) => {
                    console.log(data);
                });

                socket.removeAllListeners('successConnection');
            });
        }

        function beginChat() {
            return new Promise((resolve) => {
                socket.on('chatCreated', (data) => {
                    data.Users = [];////
                    chats.push(data);
                    socket.removeAllListeners('chatCreated');
                    resolve(data);
                });

                socket.emit('newChat', {
                    token: localStorageService.cookie.get('token')
                });
            });
        }

        function addUserToChat(user, chatId) {//~~~~
            return new Promise((resolve) => {
                socket.on('userAddedToChat', (data) => {
                    socket.removeAllListeners('userAddedToChat');

                    chats.forEach((item) => {
                        if (item.id == chatId)
                            item.Users.push(user);
                    });

                    //добавить юзера в чат!
                    console.log(data);

                    resolve(data);
                });

                socket.emit('addUserToChat', {
                    token: localStorageService.cookie.get('token'),
                    userId: user.id,
                    chatId: chatId
                });
            });
        }

        function sendMessage(text, chatId, id) {
            return new Promise((resolve) => {
                socket.on('messageSended', (data) => {
                    socket.removeAllListeners('messageSended');
                    //добавить сообщение в чат!
                    resolve(data);
                });

                socket.emit('newMessage', {
                    token: localStorageService.cookie.get('token'),
                    text: text,
                    chatId: chatId,
                    author: id
                });
            });
        }

        function getChatsWithUser(userId) {//вынести в фильтр
            var chatsWithUser = [];

            chats.forEach((chat) => {
                var flag = false;
                chat.Users.forEach((user) => {
                    if (user.id === userId)
                        flag = true;
                });
                if (flag)
                    chatsWithUser.push(chat);
            });

            return chatsWithUser;
        }

    }
]);
app.factory('requestService', ['$http', '$q',
    ($http, $q) => {
        return {
            sendRequest: sendRequest
        };

        function sendRequest(url, method, headers, sendData, config) {
            var deferred = $q.defer();

            var req = {
                method: method,
                url: url,
                data: sendData ? JSON.stringify(sendData) : '',
                config: config ? config : '',
                headers: headers ? headers : ''
            };

            $http(req).then(
                    (response) => {
                        if (response)
                            deferred.resolve(response);
                    },
                    (error) => {
                        if (error)
                            deferred.reject(error.data.message);
                    });

            return deferred.promise;
        }
    }
]);

var urls = {
    blog: 'http://localhost:3000/api/blog/',
    signIn: 'http://localhost:3000/api/auth/signin/',
    signUp: 'http://localhost:3000/api/auth/signup/',
    signOut: 'http://localhost:3000/api/auth/logout/',
    members: 'http://localhost:3000/api/user/',
    changePassword: 'http://localhost:3000/api/user/changePassword/',
    post: 'http://localhost:3000/api/post/',
    chat: 'http://localhost:3000/api/chat/'
};
app.constant("urls", urls);

app.factory('postListService', ['requestService', 'authService', 'urls', function (requestService, authService, urls) {
        var posts = [],
            errorMessages = {},
            reqData = {
                isCreatingNow: false,
                removedPost: ''
            },
            editedPost = {},
            config = {
                headers: {
                    'Content-Type': 'application/jsone;'
                }
            };

    return {
        getPosts: getPosts,
        posts: posts,
        reqData: reqData,
        editedPost: editedPost,
        errorMessages: errorMessages,
        removePost: removePost,
        createPost: createPost,
        editPost: editPost
    };

    function getPosts(userId) {
        return new Promise((resolve, reject) => {
            posts.splice(0, posts.length);
            requestService.sendRequest(urls.blog + userId, 'get').then(getPostsSuccess, getPostsError);
            function getPostsSuccess(res) {
                if (res.data) {
                    Array.prototype.push.apply(posts, res.data);
                    errorMessages.gettingPosts = '';
                    resolve();
                } else {
                    errorMessages.gettingPosts = 'No available posts.';
                    reject();
                }
            }

            function getPostsError(err) {
                errorMessages.gettingPosts = err;
                reject();
            }
        });
    }

    function createPost(sendData) {
        return new Promise((resolve, reject) => {
            var headers = {
                'Token': authService.authData.token
            };

            reqData.isCreatingNow = true;

            requestService.sendRequest(urls.post, 'post', headers, sendData, config).then(createPostSuccess, createPostError);

            function createPostSuccess(res) {
                reqData.isCreatingNow = false;
                if (res.data) {
                    posts.push(res.data);
                    errorMessages.creatingPost = '';
                    resolve();
                } else {
                    errorMessages.creatingPost = 'Somthing error. Please, try reload page.';
                    reject();
                }
            }

            function createPostError(err) {
                errorMessages.creatingPost = err;
                reqData.isCreatingNow = false;
                reject();
            }
        });
    }

    function editPost(id, sendData) {
        return new Promise((resolve, reject) => {
            var headers = {
                'Token': authService.authData.token
            };

            reqData.isCreatingNow = true;

            requestService.sendRequest(urls.post + id, 'put', headers, sendData, config).then(editPostSuccess, editPostError);

            function editPostSuccess(res) {
                reqData.isCreatingNow = false;
                errorMessages.creatingPost = '';
                resolve();
            }

            function editPostError(err) {
                errorMessages.edditingPost = err;
                reqData.isCreatingNow = false;
                reject();
            }
        });
    }

    function removePost(postId) {
        return new Promise(function (resolve, reject) {
            if (!confirm("Are you sure you want to remove the post?"))
                return;

            var headers = {
                'Token': authService.authData.token
            };

            reqData.removedPost = postId;

            requestService.sendRequest(urls.post + postId, 'delete', headers).then(removePostSuccess, removePostError);

            function removePostSuccess() {
                errorMessages.removingPost = '';
                for (var i = 0; i < posts.length; i++) {
                    if (posts[i].id === reqData.removedPost) {
                        posts.splice(i, 1);
                    }
                }
                resolve();
            }

            function removePostError(response) {
                errorMessages.removingPost = response;
                reject();
            }
        });
    }
}]);

app.factory('profileService', ['requestService', 'urls', 'authService', 'localStorageService',
    (requestService, urls, authService, localStorageService) => {
        let userInfo = {},
            notice = {
                errorGettingMessages: {},
                errorProfileMessages: {},
                errorPasswordMessages: {},
                successProfileMessages: {},
                successPasswordMessages: {}
            },
            reqData = {
                isSendingNow: false
            };

        function getUserInfo(userId) {
            return new Promise(() => {
                requestService.sendRequest(urls.members + userId, 'get')
                        .then(getInfoSuccess, getInfoError);

                function getInfoSuccess(response) {
                    if (response && response.data) {
                        notice.errorGettingMessages.gettingUserInfo = '';
                        userInfo.name = response.data.name;
                        userInfo.surname = response.data.surname;
                        userInfo.description = response.data.description;
                        userInfo.id = response.data.id;
                        userInfo.email = response.data.email;
                    }
                }

                function getInfoError(error) {
                    notice.errorGettingMessages = error;
                    userInfo.name = '';
                    userInfo.surname = '';
                    userInfo.description = '';
                    userInfo.id = '';
                }
            });
        }

        function editProfileData(profileData) {
            var config = {
                    headers: {
                        'Content-Type': 'application/jsone;'
                    }
                },
                headers = {
                    'Token': authService.authData.token
                };

            return new Promise((resolve) => {
                reqData.isSendingNow = true;

                requestService.sendRequest(urls.members + authService.authData.userId, 'put', headers, profileData, config)
                        .then(editProfileSuccess, editProfileError);

                function editProfileSuccess() {
                    authService.authData.email = profileData.email;
                    localStorageService.cookie.set('email', profileData.email);
                    notice.errorProfileMessages.editProfile = '';
                    notice.successProfileMessages.editProfile = 'Success!';
                    reqData.isSendingNow = false;
                    resolve();
                }

                function editProfileError(err) {
                    reqData.isSendingNow = false;
                    notice.errorProfileMessages.editProfile = err;
                    notice.successProfileMessages.editProfile = '';
                }
            });
        }

        function changePassword(passwordsData) {
            var config = {
                    headers: {
                        'Content-Type': 'application/jsone;'
                    }
                },
                headers = {
                    'Token': authService.authData.token
                };

            return new Promise((resolve) => {
                reqData.isSendingNow = true;

                requestService.sendRequest(urls.changePassword, 'put', headers, passwordsData, config)
                        .then(editProfileSuccess, editProfileError);

                function editProfileSuccess() {
                    reqData.isSendingNow = false;
                    notice.errorPasswordMessages.changePassword = '';
                    notice.successPasswordMessages.changePassword = 'Success!';
                    resolve();
                }

                function editProfileError(err) {
                    reqData.isSendingNow = false;
                    notice.errorPasswordMessages.changePassword = err;
                    notice.successPasswordMessages.changePassword = '';
                }
            });
        }

        return {
            getUserInfo: getUserInfo,
            editProfileData: editProfileData,
            changePassword: changePassword,
            userInfo: userInfo,
            notice: notice,
            reqData: reqData
        };
    }
]);

app.filter('filter', () => {
    return (items, params) => {
        if (!params.searchText)
            return items;

        var newItems = JSON.parse(JSON.stringify(items)),
            result = [],
            searchText = params.caseSensetive ? params.searchText : params.searchText.toLowerCase(),
            searchOptions = (params.searchBy !== 'any') ? [params.searchBy] : params.searchOptions;

        newItems.forEach(function (item, i) {
            var outerFlag = false;

            searchOptions.forEach(function (option) {
                var innerFlag;
                item[option] = params.caseSensetive ? item[option] : item[option].toLowerCase();
                innerFlag = params.fullMatch ? (item[option] === searchText) : (item[option].indexOf(searchText) > -1);
                if (innerFlag) {
                    outerFlag = true;
                    return;
                }
            });

            outerFlag = params.negative ? !outerFlag : outerFlag;
            outerFlag ? result.push(items[i]) : '';
        });

        return result;
    };
});

app.component('auth', {
    templateUrl: 'build/views/auth/auth.html',
    controller: ['authService', '$state', authController]
});

function authController(authService, $state) {
    const $ctrl = this;

    $ctrl.errorSignInMessages = authService.errorSignInMessages;
    $ctrl.errorSignUpMessages = authService.errorSignUpMessages;
    $ctrl.reqAuthData = authService.reqData;
    $ctrl.signIn = signIn;
    $ctrl.signUp = signUp;

    function signUp(userData) {
        authService.signUp(userData).then(() => {
            $state.go('member', {userId: authService.authData.userId});
        });
    }

    function signIn(userData) {
        authService.signIn(userData).then(() => {
             $state.go('member', {userId: authService.authData.userId})
        });
    }
}

app.component('blog', {
    templateUrl: 'build/views/blog/blog.html',
    controller: [blogController],
    bindings: {
        authData: '<'
    }
});

function blogController() {
    const $ctrl = this;
}

app.component('notice', {
    bindings: {
        notice: '=',
        danger: '<'
    },
    templateUrl:'build/views/components/notice.html',
    controller: [noticeController]
});

function noticeController() {
    const $ctrl = this;

    $ctrl.$onInit = function () {
        for (var key in $ctrl.notice) {
            $ctrl.notice[key] = '';
        }
    };
}

app.component('validateErrors', {
    bindings: {
        errors: '<',
        show: '<'
    },
    template: '<div class="text-danger" ng-repeat="(key, value) in $ctrl.errors" ng-if="$ctrl.messageToggle(key)">{{$ctrl.messages[key]}}</div>',
    controller: [validateErrorsController]
});

function validateErrorsController() {
    const $ctrl = this;

    $ctrl.messages = {
        required: '* This field is required',
        minlength: '* Too short value',
        maxlength: '* Too long value',
        email: '* Email is not valid',
        confirm: '* Passwords are not the same'
    };
    $ctrl.messageToggle = messageToggle;

    function messageToggle(key) {
        if (key === 'confirm' && Object.keys($ctrl.errors).length > 1)
            return false;

        if ($ctrl.show)
            return true;

        return false;
    }
}

app.component('layout', {
    templateUrl: 'build/views/layout/layout.html',
    controller: ['authService', '$state', layoutController]
});

function layoutController(authService, $state) {
    const $ctrl = this;

    $ctrl.authData = authService.authData;
    $ctrl.errorSignOutMessages = authService.errorSignOutMessages;
    $ctrl.signOut = signOut;

    function signOut() {
        authService.signOut().then(() => {
            if($state.current.name === 'editProfile')
                $state.go('members');
        });
    }
}

app.component('memberList', {
    templateUrl: 'build/views/member-list/member-list.html',
    controller: ['memberListService', memberListController],
    bindings: {
        authData: '<'
    }
});

function memberListController(memberListService) {
    memberListService.getMembers();

    const $ctrl = this;

    $ctrl.members = memberListService.members;

    $ctrl.filterParams = {
        searchOptions: ['name', 'surname']
    };

}

app.component('editModal', {
    templateUrl: 'build/views/blog/post-list/post-modal.html',
    bindings: {
        close: '&'
    },
    controller: ['postListService', editModalController]
});

function editModalController(postListService) {
    const $ctrl = this;

    $ctrl.blogReqData = postListService.reqData;

    $ctrl.postData = {
        title: postListService.editedPost.title,
        text: postListService.editedPost.text
    };

    $ctrl.submitFunc = editPost;

    function editPost() {
        postListService.editPost(postListService.editedPost.id, $ctrl.postData).then(() => {
            postListService.editedPost.title = $ctrl.postData.title;
            postListService.editedPost.text = $ctrl.postData.text;
            $ctrl.close();
        }, $ctrl.close);
    }
}

app.component('postList', {
    templateUrl: 'build/views/blog/post-list/post-list.html',
    controller: ['postListService', '$stateParams', '$uibModal', postListController],
    bindings: {
        authData: '<'
    }
});

function postListController(postListService, $stateParams, $uibModal) {

    postListService.getPosts($stateParams.userId);

    const $ctrl = this;

    $ctrl.posts = postListService.posts;
    $ctrl.userId = $stateParams.userId;
    $ctrl.removePost = postListService.removePost;

    $ctrl.openCreatingModal = openCreatingModal;
    $ctrl.openEdditingModal = openEdditingModal;

    function openCreatingModal() {
        $uibModal.open({
            component: 'postModal'
        });
    }

    function openEdditingModal(post) {
        postListService.editedPost = post;
        $uibModal.open({
            component: 'editModal'
        });
    }
}

app.component('postModal', {
    templateUrl: 'build/views/blog/post-list/post-modal.html',
    bindings: {
        close: '&'
    },
    controller: ['postListService', postModalController]
});

function postModalController(postListService) {
    const $ctrl = this;

    $ctrl.blogReqData = postListService.reqData;

    $ctrl.submitFunc = () => {
        postListService.createPost($ctrl.postData).then($ctrl.close);
    };
}

app.component('editProfile', {
    templateUrl: 'build/views/blog/profile/edit-profile.html',
    controller: ['profileService', 'localStorageService', '$state', editProfileController],
});

function editProfileController(profileService, localStorageService, $state) {
    const $ctrl = this;

    let userId = localStorageService.cookie.get('userId');

    profileService.getUserInfo(userId);

    $ctrl.changePassword = changePassword;
    $ctrl.editProfileData = editProfileData;
    $ctrl.profileData = profileService.userInfo;
    $ctrl.notice = profileService.notice;

    function changePassword(data) {
        profileService.changePassword(data);
    }

    function editProfileData(data) {
        profileService.editProfileData(data);
    }
}

app.component('profile', {
    templateUrl: 'build/views/blog/profile/profile.html',
    controller: ['profileService', '$stateParams', profileController],
    bindings: {
        authData: '<'
    }
});

function profileController(profileService, $stateParams) {
    const $ctrl = this;

    profileService.getUserInfo($stateParams.userId);

    $ctrl.errorGettingMessages = profileService.notice.errorGettingMessages;
    $ctrl.info = profileService.userInfo;
}

app.component('profileForm', {
    bindings: {
        title: '@',
        isSendingNow: '<',
        profile: '<',
        submitFunc: '<',
        errors: '<'
    },
    templateUrl: 'build/views/components/profile-form/profile-form.html',
    controller: [profileFormController]
});

function profileFormController() {
    const $ctrl = this;
}

app.directive("compareTo", compareTo);

function compareTo() {
    return {
        restrict: 'A',
        require: "ngModel",
        scope: {
            otherModelValue: "=compareTo"
        },
        link: function (scope, element, attributes, ngModel) {
            ngModel.$validators.confirm = (modelValue) => {
                return modelValue === scope.otherModelValue;
            };

            scope.$watch("otherModelValue", () => {
                ngModel.$validate();
            });
        }
    };
}

app.directive("sendMessageTo", ['chatService', '$uibModal', '$uibModalStack', 'localStorageService', messageModalSwitch]);

function messageModalSwitch(chatService, $uibModal, $uibModalStack, localStorageService) {
    return {
        restrict: 'A',
        scope: {
            member: "=sendMessageTo"
        },
        link: function (scope, element) {
            element.bind('click', () => {
                $uibModal.open({
                    templateUrl: 'build/views/components/message-modal/message-modal.html',
                    size: 'sm',
                    controller: modalController,
                    controllerAs: '$ctrl'
                });
            });

            function modalController() {
                let $ctrl = this;

                $ctrl.chats = chatService.getChatsWithUser(scope.member.id);


                $ctrl.sendMessage = sendMessage;

                function sendMessage(messageData) {
                    let userId = localStorageService.cookie.get('userId');

                    if (!messageData.chat) {
                        chatService.beginChat().then((newChatData) => {

                            chatService.addUserToChat(scope.member, newChatData.id).then(() => {

                                chatService.addUserToChat({id: userId}, newChatData.id).then(() => {//сюда передавать свою инфу

                                    chatService.sendMessage($ctrl.messageData.text, newChatData.id, userId).then((data) => {

                                        $uibModalStack.dismissAll({});
                                    });

                                });

                            });

                        });
                    } else {
                        chatService.sendMessage($ctrl.text, $ctrl.messageData.chat.id, userId).then((data) => {
                            $uibModalStack.dismissAll({});
                        });
                    }
                }

            }
        }
    };
}

app.config(['$urlRouterProvider',
    ($urlRouterProvider) => {
        $urlRouterProvider.otherwise('/');
    }
]);

app.config(['$stateProvider',
    ($stateProvider) => {
        $stateProvider.state('auth', {
            url: "/auth",
            component: 'auth',
            data: {
                auth: "Anonymous"
            }
        });
    }
]);

app.config(['$stateProvider',
    function ($stateProvider) {
        $stateProvider.state('member', {
            url: "/:userId",
            component: 'blog',
            resolve: {
                authData: ['authService',
                    (authService) => {
                        return authService.authData;
                    }
                ]
            }
        });

        $stateProvider.state('editProfile', {
            url: "/editProfile",
            component: 'editProfile',
            data: {
                auth: "Authorized"
            }
        });
    }
]);

app.config(['$stateProvider',
    ($stateProvider) => {
        $stateProvider.state('members', {
            url: "/",
            component: 'memberList',
            resolve: {
                authData: ['authService', (authService) => {
                        return authService.authData;
                    }
                ]
            }
        });
    }
]);
